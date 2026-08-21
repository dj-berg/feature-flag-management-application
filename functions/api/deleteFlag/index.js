const { DynamoDBClient, DeleteItemCommand } = require("@aws-sdk/client-dynamodb");
const { marshall } = require("@aws-sdk/util-dynamodb");

const client = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME;

const OPERATION_NAME = "flags.delete";

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

const hasWritePermission = (permissions) =>
  permissions.includes("flags:write") || permissions.includes("flags:write:any");

const isSupportedTokenType = (tokenType) => tokenType === "consumer" || tokenType === "admin";

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
  const payload =
    typeof event?.body === "string"
      ? (() => {
          try {
            return JSON.parse(event.body);
          } catch {
            return {};
          }
        })()
      : event?.body || {};

  return {
    accountId: String(
      query.accountId || query.account_id || payload.accountId || payload.account_id || ""
    ).trim(),
    appId: String(
      query.appId ||
        query.applicationId ||
        query.application_id ||
        payload.appId ||
        payload.applicationId ||
        payload.application_id ||
        ""
    ).trim(),
  };
};

const logAuthorizationDecision = ({ decision, reason, identity, event, requestScope, flagKey }) => {
  const payload = {
    category: "authorization",
    component: "api-delete-flag",
    operation: OPERATION_NAME,
    decision,
    reason,
    accountId: identity?.accountId || "",
    appId: identity?.appId || "",
    tokenType: identity?.tokenType || "",
    subject: identity?.subject || "",
    permissions: identity?.permissions || [],
    requestScope: requestScope || null,
    flagKey: flagKey || "",
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

const buildTenantKeys = ({ accountId, appId, flagKey }) => ({
  pk: `ACC#${accountId}#APP#${appId}`,
  sk: `FLAG#${flagKey}`,
});

exports.handler = async (event) => {
  let identity;
  let requestScope;
  let flagKey;

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

    flagKey = String(event?.pathParameters?.flagKey || "").trim();
    if (!flagKey) {
      return response(400, {
        message: "flagKey path parameter is required.",
      });
    }

    logAuthorizationDecision({
      decision: "allow",
      reason: "Authorization checks passed.",
      identity,
      event,
      requestScope,
      flagKey,
    });

    const key = buildTenantKeys({
      accountId: identity.accountId,
      appId: identity.appId,
      flagKey,
    });

    await client.send(
      new DeleteItemCommand({
        TableName: TABLE_NAME,
        Key: marshall(key),
      })
    );

    return response(200, {
      message: "Feature flag deleted successfully.",
      flagKey,
      accountId: identity.accountId,
      appId: identity.appId,
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
        flagKey,
      });
    }
    return response(500, {
      message: "Failed to delete feature flag.",
    });
  }
};
