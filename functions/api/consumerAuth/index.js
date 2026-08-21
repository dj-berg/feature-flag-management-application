const { DynamoDBClient, GetItemCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");
const crypto = require("node:crypto");
const {
  createScopedConsumerToken,
  getTokenLifespanSeconds,
} = require("./lib/jwt");
const { hashScryptSecret, verifySecret } = require("./lib/credentials");

const client = new DynamoDBClient({});

const APP_DATA_TABLE_NAME = process.env.APP_DATA_TABLE_NAME || process.env.APPLICATIONS_TABLE_NAME;
const JWT_ISSUER = process.env.JWT_ISSUER;
const JWT_AUDIENCE = process.env.JWT_AUDIENCE;
const JWT_PRIVATE_KEY = process.env.JWT_PRIVATE_KEY;
const JWT_KEY_ID = process.env.JWT_KEY_ID || "consumer-auth-rs256";
const JWT_EXPIRES_IN_SECONDS = Number(process.env.JWT_EXPIRES_IN_SECONDS || 900);
const DEFAULT_ENVIRONMENT = String(process.env.DEFAULT_ENVIRONMENT || "dev").trim();
const ONBOARDING_API_KEY = String(process.env.ONBOARDING_API_KEY || "").trim();

const OPERATION_NAME = "consumer.auth";
const ALLOWED_CONSUMER_PERMISSIONS = new Set([
  "flags:read",
  "flags:write",
  "flags:subscribe",
]);

const response = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const logAuthorizationDecision = ({ decision, reason, accountId, appId, clientId, permissions, event }) => {
  const payload = {
    category: "authorization",
    component: "api-consumer-auth",
    operation: OPERATION_NAME,
    decision,
    reason,
    accountId: accountId || "",
    appId: appId || "",
    clientId: clientId || "",
    permissions: permissions || [],
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

const parseJsonBody = (rawBody) => {
  if (!rawBody) {
    return {};
  }

  if (typeof rawBody === "object") {
    return rawBody;
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new Error("Invalid JSON payload.");
  }
};

const sanitizeIdentifier = (value) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

const createClientId = ({ accountId, appId, environment }) => {
  const account = sanitizeIdentifier(accountId);
  const app = sanitizeIdentifier(appId);
  const env = sanitizeIdentifier(environment);
  const suffix = crypto.randomBytes(6).toString("hex");
  return `cli_${account}_${app}_${env}_${suffix}`;
};

const createClientSecret = () => crypto.randomBytes(32).toString("base64url");

const parsePermissions = (permissions) => {
  if (Array.isArray(permissions)) {
    return permissions.filter(Boolean);
  }

  if (typeof permissions === "string") {
    return permissions
      .split(/[\s,]+/)
      .map((permission) => permission.trim())
      .filter(Boolean);
  }

  return [];
};

const defaultPermissions = ["flags:read", "flags:write", "flags:subscribe"];

const normalizeConsumerPermissions = (permissions) => {
  const parsed = parsePermissions(permissions);
  if (!parsed.length) {
    return defaultPermissions;
  }

  const normalized = parsed.filter((permission) => ALLOWED_CONSUMER_PERMISSIONS.has(permission));
  return normalized.length ? normalized : defaultPermissions;
};

const isApplicationActive = (application) => {
  const status = String(application?.status || "active").toLowerCase();
  return status === "active";
};

const getApplicationByClientId = async (clientId) => {
  const result = await client.send(
    new GetItemCommand({
      TableName: APP_DATA_TABLE_NAME,
      Key: {
        clientId: { S: clientId },
      },
      ConsistentRead: true,
    })
  );

  if (!result.Item) {
    return null;
  }

  return unmarshall(result.Item);
};

const isOnboardingRequest = (event) => {
  const path = String(event?.path || event?.rawPath || "").toLowerCase();
  const resource = String(event?.resource || "").toLowerCase();
  const routeKey = String(event?.requestContext?.routeKey || "").toLowerCase();
  return (
    path.endsWith("/consumer/onboard") ||
    resource.endsWith("/consumer/onboard") ||
    routeKey.endsWith("/consumer/onboard")
  );
};

const validateOnboardingAccess = (event) => {
  if (!ONBOARDING_API_KEY) {
    return false;
  }

  const supplied =
    event?.headers?.["x-onboarding-api-key"] ||
    event?.headers?.["X-Onboarding-Api-Key"] ||
    event?.headers?.["x-onboarding-api-key".toLowerCase()] ||
    "";

  return String(supplied).trim() === ONBOARDING_API_KEY;
};

const normalizeOnboardingPayload = (payload) => {
  const accountId = String(payload?.accountId || payload?.account_id || "").trim();
  const appId = String(payload?.appId || payload?.applicationId || payload?.application_id || "").trim();
  const environment = String(payload?.environment || DEFAULT_ENVIRONMENT || "dev").trim();
  const permissions = normalizeConsumerPermissions(payload?.permissions);

  return {
    accountId,
    appId,
    environment,
    permissions,
  };
};

const onboardApplication = async ({ accountId, appId, environment, permissions }) => {
  const now = new Date().toISOString();
  const clientId = createClientId({ accountId, appId, environment });
  const clientSecret = createClientSecret();
  const hashedSecret = await hashScryptSecret(clientSecret);

  const item = {
    clientId,
    accountId,
    appId,
    environment,
    permissions,
    status: "active",
    secretHash: hashedSecret.hash,
    secretSalt: hashedSecret.salt,
    secretAlgorithm: hashedSecret.algorithm,
    secretKeyLength: hashedSecret.keyLength,
    secretCost: hashedSecret.cost,
    secretBlockSize: hashedSecret.blockSize,
    secretParallelization: hashedSecret.parallelization,
    createdAt: now,
    updatedAt: now,
  };

  await client.send(
    new PutItemCommand({
      TableName: APP_DATA_TABLE_NAME,
      Item: marshall(item),
      ConditionExpression: "attribute_not_exists(clientId)",
    })
  );

  return {
    clientId,
    clientSecret,
    accountId,
    appId,
    environment,
    permissions,
  };
};

exports.handler = async (event) => {
  let clientId = "";

  try {
    if (!APP_DATA_TABLE_NAME || !JWT_ISSUER || !JWT_AUDIENCE || !JWT_PRIVATE_KEY) {
      return response(500, {
        message: "Auth service is not configured correctly.",
      });
    }

    let payload;

    try {
      payload = parseJsonBody(event.body);
    } catch {
      return response(400, {
        message: "Request body must be valid JSON.",
      });
    }

    if (isOnboardingRequest(event)) {
      if (!validateOnboardingAccess(event)) {
        return response(403, {
          message: "Onboarding is not authorized.",
        });
      }

      const onboarding = normalizeOnboardingPayload(payload);
      if (!onboarding.accountId || !onboarding.appId || !onboarding.environment) {
        return response(400, {
          message: "accountId, appId, and environment are required.",
        });
      }

      try {
        const created = await onboardApplication(onboarding);
        return response(201, created);
      } catch (error) {
        if (error?.name === "ConditionalCheckFailedException") {
          return response(409, {
            message: "Application onboarding conflict. Try again.",
          });
        }
        throw error;
      }
    }

    clientId = String(payload.clientId || "").trim();
    const clientSecret = String(payload.clientSecret || "");

    if (!clientId || !clientSecret) {
      logAuthorizationDecision({
        decision: "deny",
        reason: "Missing client credentials in request.",
        clientId,
        event,
      });
      return response(400, {
        message: "clientId and clientSecret are required.",
      });
    }

    const application = await getApplicationByClientId(clientId);

    if (!application) {
      logAuthorizationDecision({
        decision: "deny",
        reason: "Invalid client credentials.",
        clientId,
        event,
      });
      return response(401, { message: "Invalid credentials." });
    }

    if (!isApplicationActive(application)) {
      logAuthorizationDecision({
        decision: "deny",
        reason: "Application is inactive.",
        accountId: String(application.accountId || "").trim(),
        appId: String(application.appId || application.applicationId || "").trim(),
        clientId,
        event,
      });
      return response(403, { message: "Application is inactive." });
    }

    const secretIsValid = await verifySecret(clientSecret, {
      hash: application.secretHash,
      salt: application.secretSalt,
      algorithm: application.secretAlgorithm,
      keyLength: application.secretKeyLength,
      cost: application.secretCost,
      blockSize: application.secretBlockSize,
      parallelization: application.secretParallelization,
    });

    if (!secretIsValid) {
      logAuthorizationDecision({
        decision: "deny",
        reason: "Invalid client credentials.",
        accountId: String(application.accountId || "").trim(),
        appId: String(application.appId || application.applicationId || "").trim(),
        clientId,
        event,
      });
      return response(401, { message: "Invalid credentials." });
    }

    const accountId = String(application.accountId || application.account_id || "").trim();
    const appId = String(application.appId || application.applicationId || application.application_id || "").trim();
    const environment = String(application.environment || application.env || DEFAULT_ENVIRONMENT || "dev").trim();
    const effectivePermissions = normalizeConsumerPermissions(application.permissions);

    if (!accountId || !appId || !environment) {
      logAuthorizationDecision({
        decision: "deny",
        reason: "Application record is missing account/app/environment scope metadata.",
        accountId,
        appId,
        clientId,
        permissions: effectivePermissions,
        event,
      });
      return response(500, {
        message: "Application record is missing required scope metadata.",
      });
    }

    logAuthorizationDecision({
      decision: "allow",
      reason: "Application authenticated and scoped token issued.",
      accountId,
      appId,
      clientId,
      permissions: effectivePermissions,
      event,
    });

    const accessToken = createScopedConsumerToken({
      accountId,
      appId,
      environment,
      permissions: effectivePermissions,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      privateKey: JWT_PRIVATE_KEY,
      keyId: JWT_KEY_ID,
      expiresInSeconds: JWT_EXPIRES_IN_SECONDS,
    });

    return response(200, {
      accessToken,
      tokenType: "Bearer",
      expiresIn: getTokenLifespanSeconds(accessToken),
      accountId,
      appId,
      environment,
      permissions: effectivePermissions,
      scope: effectivePermissions.join(" "),
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
    });
  } catch (error) {
    console.error(error);

    if (clientId) {
      logAuthorizationDecision({
        decision: "deny",
        reason: error?.message || "Unhandled authorization failure.",
        clientId,
        event,
      });
    }

    return response(500, {
      message: "Failed to authenticate application.",
    });
  }
};
