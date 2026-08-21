const { publishToKafka } = require("./kafka");

const getString = (attributeValue) => {
  if (!attributeValue || typeof attributeValue !== "object") {
    return null;
  }

  if (typeof attributeValue.S === "string") {
    return attributeValue.S;
  }

  return null;
};

const getBoolean = (attributeValue) => {
  if (!attributeValue || typeof attributeValue !== "object") {
    return null;
  }

  if (typeof attributeValue.BOOL === "boolean") {
    return attributeValue.BOOL;
  }

  if (typeof attributeValue.N === "string") {
    if (attributeValue.N === "1") {
      return true;
    }

    if (attributeValue.N === "0") {
      return false;
    }
  }

  return null;
};

const getNumber = (attributeValue) => {
  if (!attributeValue || typeof attributeValue !== "object" || typeof attributeValue.N !== "string") {
    return null;
  }

  const value = Number(attributeValue.N);
  return Number.isFinite(value) ? value : null;
};

const resolveRecordRevision = (record) => {
  const persistedRevision =
    getNumber(record?.dynamodb?.NewImage?.revision) ||
    getNumber(record?.dynamodb?.OldImage?.revision);
  if (persistedRevision) {
    return persistedRevision;
  }

  const approxCreationEpochSeconds = record?.dynamodb?.ApproximateCreationDateTime;
  if (typeof approxCreationEpochSeconds === "number") {
    const baseMs = Math.floor(approxCreationEpochSeconds * 1000);
    const sequenceNumber = record?.dynamodb?.SequenceNumber;

    if (typeof sequenceNumber === "string" && sequenceNumber.length > 0) {
      const sequenceTail = Number(sequenceNumber.slice(-6));
      if (Number.isFinite(sequenceTail)) {
        return baseMs + sequenceTail / 1_000_000;
      }
    }

    return baseMs;
  }

  const updatedAt =
    getString(record?.dynamodb?.NewImage?.updatedAt) ||
    getString(record?.dynamodb?.OldImage?.updatedAt) ||
    getString(record?.dynamodb?.NewImage?.createdAt);

  if (updatedAt) {
    const parsed = Date.parse(updatedAt);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return Date.now();
};

const buildChangeFromRecord = (record) => {
  const flagKey =
    getString(record?.dynamodb?.NewImage?.flagKey) ||
    getString(record?.dynamodb?.OldImage?.flagKey);

  if (!flagKey) {
    return null;
  }

  if (record.eventName === "REMOVE") {
    return {
      flagKey,
      deleted: true,
      revision: resolveRecordRevision(record),
    };
  }

  const enabled = getBoolean(record?.dynamodb?.NewImage?.enabled);
  if (enabled === null) {
    return null;
  }

  return {
    flagKey,
    enabled,
    deleted: false,
    revision: resolveRecordRevision(record),
  };
};

const getTenantScopeFromRecord = (record) => {
  const accountId =
    getString(record?.dynamodb?.NewImage?.accountId) ||
    getString(record?.dynamodb?.OldImage?.accountId);
  const appId =
    getString(record?.dynamodb?.NewImage?.appId) ||
    getString(record?.dynamodb?.OldImage?.appId);

  if (!accountId || !appId) {
    return null;
  }

  return {
    accountId,
    appId,
    tenantKey: `${accountId}::${appId}`,
  };
};

const buildDeltaPayloads = ({ records }) => {
  const latestByFlagPerTenant = new Map();

  for (const record of records) {
    const tenant = getTenantScopeFromRecord(record);
    if (!tenant) {
      continue;
    }

    const change = buildChangeFromRecord(record);
    if (!change) {
      continue;
    }

    if (!latestByFlagPerTenant.has(tenant.tenantKey)) {
      latestByFlagPerTenant.set(tenant.tenantKey, {
        accountId: tenant.accountId,
        appId: tenant.appId,
        latestByFlag: new Map(),
      });
    }

    const tenantChanges = latestByFlagPerTenant.get(tenant.tenantKey);
    const latestByFlag = tenantChanges.latestByFlag;

    const previous = latestByFlag.get(change.flagKey);
    if (!previous || change.revision >= previous.revision) {
      latestByFlag.set(change.flagKey, change);
    }
  }

  return Array.from(latestByFlagPerTenant.values()).map((tenantChanges) => {
    const changes = Array.from(tenantChanges.latestByFlag.values()).sort(
      (a, b) => a.revision - b.revision
    );

    const revision = changes.length
      ? changes[changes.length - 1].revision
      : Date.now();

    return {
      accountId: tenantChanges.accountId,
      appId: tenantChanges.appId,
      revision,
      changes,
    };
  });
};

const buildScopedChannel = ({ accountId, appId }) =>
  `flags:acc:${accountId}:app:${appId}`;

exports.handler = async (event) => {
  console.log("DynamoDB stream event received:", JSON.stringify(event));

  const records = event.Records || [];
  const tableName =
    process.env.TABLE_NAME || records[0]?.eventSourceARN?.split("/").pop() || "";

  if (records.length === 0) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "No DynamoDB stream records to process.",
        recordsProcessed: 0,
        recordsPublished: 0,
      }),
    };
  }

  if (!tableName) {
    throw new Error("TABLE_NAME environment variable is required for stream publisher.");
  }

  const topic = process.env.KAFKA_TOPIC || "feature-flag-changes";

  const payloads = buildDeltaPayloads({ records });

  if (!payloads.length) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Processed DynamoDB stream records.",
        recordsProcessed: records.length,
        recordsPublished: 0,
        topic,
      }),
    };
  }

  const lastEventId = records[records.length - 1]?.eventID;

  let recordsPublished = 0;
  let changesPublished = 0;
  let latestRevision = 0;

  try {
    for (const payload of payloads) {
      const headers = {
        "x-centrifugo-channels": buildScopedChannel(payload),
      };

      if (lastEventId) {
        headers["x-centrifugo-idempotency-key"] = `${lastEventId}:${payload.accountId}:${payload.appId}`;
      }

      await publishToKafka({
        topic,
        message: payload,
        headers,
      });

      recordsPublished += 1;
      changesPublished += payload.changes.length;
      latestRevision = Math.max(latestRevision, Number(payload.revision) || 0);
    }
  } catch (error) {
    console.error("Failed to publish stream batch snapshot:", error);
    throw error;
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Processed DynamoDB stream records.",
      recordsProcessed: records.length,
      recordsPublished,
      topic,
      revision: latestRevision,
      changesPublished,
      idempotencyKey: lastEventId || null,
    }),
  };
};
