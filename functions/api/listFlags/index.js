const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");

const client = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME;

const OPERATION_NAME = "flags.list";

const response = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const parsePermissions = (value) =>
  String(value || "")
    .split(/[\s,]+/)
    .map((permission) => permission.trim())
    .filter(Boolean);

const hasReadPermission = (permissions) =>
  permissions.includes("flags:read") || permissions.includes("flags:read:any");

const hasForbiddenConsumerPermission = (identity) => {
  if (identity.tokenType !== "consumer") {
    return false;
  }

  return identity.permissions.some(
    (permission) => permission.endsWith(":any") || permission.startsWith("apps:")
  );
};

const isSupportedTokenType = (tokenType) => tokenType === "consumer" || tokenType === "admin";

const buildTenantPartitionKey = ({ accountId, appId }) =>
  `ACC#${accountId}#APP#${appId}`;

const getIdentity = (event) => {
  const authorizer = event?.requestContext?.authorizer || {};
  return {
    accountId: String(authorizer.accountId || "").trim(),
    appId: String(authorizer.appId || "").trim(),
    tokenType: String(authorizer.tokenType || "").trim(),
    subject: String(authorizer.subject || "").trim(),
    permissions: parsePermissions(authorizer.permissions),
  };
};

const normalizeRequestScope = (event) => {
  const query = event?.queryStringParameters || {};
  return {
    accountId: String(query.accountId || query.account_id || "").trim(),
    appId: String(query.appId || query.applicationId || query.application_id || "").trim(),
  };
};

const logAuthorizationDecision = ({ decision, reason, identity, event, requestScope }) => {
  const payload = {
    category: "authorization",
    component: "api-list-flags",
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

exports.handler = async (event) => {
  let identity;
  let requestScope;

  try {
    if (!TABLE_NAME) {
      return response(500, { message: "TABLE_NAME is not configured." });
    }

    identity = getIdentity(event);
    requestScope = normalizeRequestScope(event);

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

    if (hasForbiddenConsumerPermission(identity)) {
      logAuthorizationDecision({
        decision: "deny",
        reason: "Consumer token contains forbidden elevated permissions.",
        identity,
        event,
        requestScope,
      });
      return response(403, {
        message: "Token permissions are not valid for consumer access.",
      });
    }

    if (!hasReadPermission(identity.permissions)) {
      logAuthorizationDecision({
        decision: "deny",
        reason: "Missing required permission: flags:read.",
        identity,
        event,
        requestScope,
      });
      return response(403, {
        message: "Missing required permission: flags:read.",
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

    logAuthorizationDecision({
      decision: "allow",
      reason: "Authorization checks passed.",
      identity,
      event,
      requestScope,
    });

    const pk = buildTenantPartitionKey(identity);

    const result = await client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: {
          ":pk": { S: pk },
        },
        ConsistentRead: true,
      })
    );

    const flags = {};
    const descriptions = {};
    let revision = 0;

    for (const rawItem of result.Items || []) {
      const item = unmarshall(rawItem);
      if (!item.flagKey || typeof item.enabled !== "boolean") {
        continue;
      }

      flags[item.flagKey] = item.enabled;
      if (typeof item.description === "string" && item.description.trim()) {
        descriptions[item.flagKey] = item.description.trim();
      }
      const itemRevision = Number(item.revision);
      if (Number.isFinite(itemRevision) && itemRevision > 0) {
        revision = Math.max(revision, itemRevision);
      } else {
        const updatedAtMs = Date.parse(item.updatedAt || item.createdAt || "");
        if (Number.isFinite(updatedAtMs)) {
          revision = Math.max(revision, updatedAtMs);
        }
      }
    }

    return response(200, {
      accountId: identity.accountId,
      appId: identity.appId,
      flags,
      descriptions,
      revision,
    });
  } catch (error) {
    console.error(error);
    if (identity || requestScope) {
      logAuthorizationDecision({
        decision: "deny",
        reason: error?.message || "Unhandled authorization failure.",
        identity,
        event,
        requestScope,
      });
    }
    return response(500, { message: "Failed to load feature flags." });
  }
};
