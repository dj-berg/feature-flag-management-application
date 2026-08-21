const { DynamoDBClient, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");

const client = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME;

const OPERATION_NAME = "flags.create";

const parsePermissions = (value) => {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[\s,]+/)
      .map((permission) => permission.trim())
      .filter(Boolean);
  }

  return [];
};

const logAuthorizationDecision = ({ decision, reason, identity, event, requestScope }) => {
  const payload = {
    category: "authorization",
    component: "api-create-flag",
    operation: OPERATION_NAME,
    decision,
    reason,
    accountId: identity?.accountId || "",
    appId: identity?.appId || "",
    tokenType: identity?.tokenType || "",
    subject: identity?.subject || "",
    permissions: identity?.permissions || [],
    requestScope: requestScope || null,
    requestId: event?.requestContext?.requestId || "",
    sourceIp: event?.requestContext?.identity?.sourceIp || "",
  };

  const line = JSON.stringify(payload);
  if (decision === "deny") {
    console.warn(line);
    return;
  }

  console.log(line);
};

const getIdentity = (event) => {
  const authorizer = event?.requestContext?.authorizer || {};
  const accountId = String(authorizer.accountId || "").trim();
  const appId = String(authorizer.appId || "").trim();
  const environment = String(authorizer.environment || authorizer.env || "").trim();
  const permissions = parsePermissions(authorizer.permissions);

  const tenantDisplayName = String(
    authorizer.tenantDisplayName || authorizer.accountName || authorizer.accountDisplayName || ""
  ).trim();
  const appDisplayName = String(
    authorizer.appDisplayName || authorizer.applicationName || authorizer.appName || ""
  ).trim();

  return {
    accountId,
    appId,
    environment,
    tenantDisplayName,
    appDisplayName,
    permissions,
    tokenType: String(authorizer.tokenType || "").trim(),
    subject: String(authorizer.subject || "").trim(),
  };
};

const hasWritePermission = (permissions) =>
  permissions.includes("flags:write") || permissions.includes("flags:write:any");

const isSupportedTokenType = (tokenType) => tokenType === "consumer" || tokenType === "admin";

const normalizeRequestScope = (payload = {}) => {
  const accountId = String(payload.accountId || payload.account_id || "").trim();
  const appId = String(payload.appId || payload.applicationId || payload.application_id || "").trim();

  return {
    accountId,
    appId,
  };
};

const buildTenantKeys = ({ accountId, appId, flagKey }) => ({
  pk: `ACC#${accountId}#APP#${appId}`,
  sk: `FLAG#${flagKey}`,
});

const buildTenantScopeLabel = ({ accountId, appId, environment }) => {
  const segments = [`account:${accountId}`, `app:${appId}`];
  if (environment) {
    segments.push(`env:${environment}`);
  }
  return segments.join(" | ");
};

const response = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  let identity;
  let requestScope;

  try {
    if (!TABLE_NAME) {
      return response(500, { message: "TABLE_NAME is not configured." });
    }

    const payload =
      typeof event.body === "string" ? JSON.parse(event.body) : event.body || {};

    const flagKey = String(payload.flagKey || "").trim();
    const enabled = payload.enabled;
    const description =
      typeof payload.description === "string" ? payload.description.trim() : undefined;

    identity = getIdentity(event);
    requestScope = normalizeRequestScope(payload);

    if (!identity.accountId || !identity.appId) {
      logAuthorizationDecision({
        decision: "deny",
        reason: "Missing tenant identity in token.",
        identity,
        event,
        requestScope,
      });
      return response(401, {
        message: "Missing tenant identity in token.",
      });
    }

    if (!isSupportedTokenType(identity.tokenType)) {
      logAuthorizationDecision({
        decision: "deny",
        reason: "Unsupported token type.",
        identity,
        event,
        requestScope,
      });
      return response(403, {
        message: "Unsupported token type for this operation.",
      });
    }

    if (!hasWritePermission(identity.permissions)) {
      logAuthorizationDecision({
        decision: "deny",
        reason: "Missing required permission: flags:write.",
        identity,
        event,
        requestScope,
      });
      return response(403, {
        message: "Missing required permission: flags:write.",
      });
    }

    if (
      (requestScope.accountId && requestScope.accountId !== identity.accountId) ||
      (requestScope.appId && requestScope.appId !== identity.appId)
    ) {
      logAuthorizationDecision({
        decision: "deny",
        reason: "Token scope does not match request scope.",
        identity,
        event,
        requestScope,
      });
      return response(403, {
        message: "Token scope does not match request scope.",
      });
    }

    if (!flagKey || typeof enabled !== "boolean") {
      return response(400, {
        message: "flagKey is required and enabled must be a boolean.",
      });
    }

    if (typeof payload.description !== "undefined" && typeof payload.description !== "string") {
      return response(400, {
        message: "description must be a string when provided.",
      });
    }

    logAuthorizationDecision({
      decision: "allow",
      reason: "Authorization checks passed.",
      identity,
      event,
      requestScope,
    });

    const now = new Date().toISOString();
    const revision = Date.now();
    const keys = buildTenantKeys({
      accountId: identity.accountId,
      appId: identity.appId,
      flagKey,
    });
    const tenantScope = buildTenantScopeLabel(identity);

    const baseExpressionValues = {
      ":enabled": enabled,
      ":updatedAt": now,
      ":revision": revision,
      ":createdAt": now,
      ":accountId": identity.accountId,
      ":appId": identity.appId,
      ":updatedBy": identity.subject || `app:${identity.appId}`,
      ":recordType": "feature_flag",
      ":tenantScope": tenantScope,
      ":schemaVersion": 2,
    };

    if (identity.environment) {
      baseExpressionValues[":environment"] = identity.environment;
    }

    if (identity.tenantDisplayName) {
      baseExpressionValues[":tenantDisplayName"] = identity.tenantDisplayName;
    }

    if (identity.appDisplayName) {
      baseExpressionValues[":appDisplayName"] = identity.appDisplayName;
    }

    const baseUpdateExpressionParts = [
      "accountId = :accountId",
      "appId = :appId",
      "enabled = :enabled",
      "updatedAt = :updatedAt",
      "revision = :revision",
      "createdAt = if_not_exists(createdAt, :createdAt)",
      "updatedBy = :updatedBy",
      "recordType = :recordType",
      "tenantScope = :tenantScope",
      "schemaVersion = :schemaVersion",
    ];

    if (identity.environment) {
      baseUpdateExpressionParts.push("environment = :environment");
    }

    if (identity.tenantDisplayName) {
      baseUpdateExpressionParts.push("tenantDisplayName = :tenantDisplayName");
    }

    if (identity.appDisplayName) {
      baseUpdateExpressionParts.push("appDisplayName = :appDisplayName");
    }

    if (typeof description === "string" && description) {
      baseExpressionValues[":description"] = description;
      baseUpdateExpressionParts.push("description = :description");
    }

    const expressionValues = {
      ...baseExpressionValues,
      ":flagKey": flagKey,
    };
    const updateExpressionParts = [...baseUpdateExpressionParts, "flagKey = :flagKey"];

    const result = await client.send(
      new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key: marshall(keys),
        UpdateExpression: `SET ${updateExpressionParts.join(", ")}`,
        ExpressionAttributeValues: marshall(expressionValues),
        ReturnValues: "ALL_NEW",
      })
    );

    return response(200, {
      message: "Feature flag saved successfully.",
      item: unmarshall(result?.Attributes || {}),
    });
  } catch (error) {
    console.error(error);

    logAuthorizationDecision({
      decision: "deny",
      reason: error?.message || "Unhandled authorization failure.",
      identity,
      event,
      requestScope,
    });

    return response(500, {
      message: "Failed to create feature flag.",
    });
  }
};
