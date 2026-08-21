const jwt = require("jsonwebtoken");
const jwkToPem = require("jwk-to-pem");

const COGNITO_REGION = process.env.COGNITO_REGION || "us-east-1";
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const REQUIRED_SCOPES = (process.env.REQUIRED_SCOPES || "")
  .split(",")
  .map((scope) => scope.trim())
  .filter(Boolean);
const CONSUMER_JWT_ISSUER = process.env.CONSUMER_JWT_ISSUER;
const CONSUMER_JWT_AUDIENCE = process.env.CONSUMER_JWT_AUDIENCE;
const CONSUMER_JWT_PUBLIC_KEY = process.env.CONSUMER_JWT_PUBLIC_KEY;

const logAuthorizationDecision = ({ decision, reason, event, identity }) => {
  const authorizerEventType = String(event?.type || "REQUEST").toUpperCase();
  const httpMethod = event?.httpMethod || event?.requestContext?.httpMethod || "";
  const path = event?.path || event?.requestContext?.path || "";

  const payload = {
    category: "authorization",
    component: "gateway-authorizer",
    decision,
    reason,
    eventType: authorizerEventType,
    methodArn: event?.methodArn || "",
    httpMethod,
    path,
    accountId: identity?.accountId || "",
    appId: identity?.appId || "",
    tokenType: identity?.tokenType || "",
    subject: identity?.subject || "",
    permissions: identity?.permissions || "",
  };

  const line = JSON.stringify(payload);
  if (decision === "deny") {
    console.warn(line);
    return;
  }

  console.log(line);
};

const getPolicyDocument = (effect, methodArn, context = {}) => {
  const arnParts = methodArn.split(":");
  const apiGatewayArn = arnParts[5].split("/");

  const region = arnParts[3];
  const accountId = arnParts[4];
  const apiId = apiGatewayArn[0];
  const stage = apiGatewayArn[1];

  return {
    principalId: "user",
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: effect,
          Resource: `arn:aws:execute-api:${region}:${accountId}:${apiId}/${stage}/*/*`,
        },
      ],
    },
    context,
  };
};

const getToken = (event) => {
  const authorization =
    event.headers?.Authorization ||
    event.headers?.authorization ||
    event.authorizationToken;

  if (!authorization) {
    return null;
  }

  const parts = authorization.split(" ");

  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return null;
  }

  return parts[1];
};

const validateTokenScopes = (tokenScopes) => {
  if (!REQUIRED_SCOPES.length) {
    return true;
  }

  if (!Array.isArray(tokenScopes)) {
    return false;
  }

  return REQUIRED_SCOPES.every((scope) => tokenScopes.includes(scope));
};

const parsePermissions = (claims) => {
  if (Array.isArray(claims.permissions)) {
    return claims.permissions.filter(Boolean);
  }

  if (typeof claims.permissions === "string") {
    return claims.permissions
      .split(/[\s,]+/)
      .map((permission) => permission.trim())
      .filter(Boolean);
  }

  if (typeof claims.scope === "string") {
    return claims.scope
      .split(/[\s,]+/)
      .map((permission) => permission.trim())
      .filter(Boolean);
  }

  return [];
};

const buildIdentityContext = (claims) => {
  const permissions = parsePermissions(claims);
  const accountId =
    claims.accountId ||
    claims.account_id ||
    claims["custom:accountId"] ||
    claims["custom:account_id"] ||
    "";
  const appId =
    claims.appId ||
    claims.applicationId ||
    claims.application_id ||
    claims["custom:appId"] ||
    claims["custom:applicationId"] ||
    claims["custom:application_id"] ||
    "";
  const environment =
    claims.environment ||
    claims.env ||
    claims["custom:environment"] ||
    "";
  const tenantDisplayName =
    claims.tenantDisplayName ||
    claims.accountName ||
    claims["custom:tenantDisplayName"] ||
    claims["custom:accountName"] ||
    "";
  const appDisplayName =
    claims.appDisplayName ||
    claims.applicationName ||
    claims.appName ||
    claims["custom:appDisplayName"] ||
    claims["custom:applicationName"] ||
    "";
  const tokenType = String(claims.token_type || "").trim();
  const tokenUse = String(claims.token_use || "").trim();

  const resolvedTokenType = tokenType || (tokenUse === "access" ? "admin" : "unknown");

  return {
    tokenType: resolvedTokenType,
    tokenUse,
    accountId: String(accountId || ""),
    appId: String(appId || ""),
    applicationId: String(appId || ""),
    environment: String(environment || ""),
    tenantDisplayName: String(tenantDisplayName || ""),
    appDisplayName: String(appDisplayName || ""),
    permissions: permissions.join(","),
    subject: String(claims.sub || ""),
  };
};

const validateTenantClaims = ({ tokenType, accountId, appId, environment }) => {
  if (!accountId) {
    return "Missing required account scope claim.";
  }

  if (tokenType === "consumer" && !appId) {
    return "Missing required application scope claim for consumer token.";
  }

  if (tokenType === "consumer" && !environment) {
    return "Missing required environment claim for consumer token.";
  }

  return null;
};

const verifyConsumerToken = (token) => {
  if (!CONSUMER_JWT_PUBLIC_KEY || !CONSUMER_JWT_ISSUER || !CONSUMER_JWT_AUDIENCE) {
    return null;
  }

  return jwt.verify(token, CONSUMER_JWT_PUBLIC_KEY, {
    algorithms: ["RS256"],
    issuer: CONSUMER_JWT_ISSUER,
    audience: CONSUMER_JWT_AUDIENCE,
  });
};

const getSigningKey = async (token) => {
  const decoded = jwt.decode(token, { complete: true });

  if (!decoded?.header?.kid) {
    throw new Error("Invalid token.");
  }

  if (!COGNITO_USER_POOL_ID) {
    throw new Error("COGNITO_USER_POOL_ID is not set.");
  }

  const jwksUrl = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}/.well-known/jwks.json`;

  const jwks = await fetch(jwksUrl).then((response) => response.json());
  const key = jwks.keys.find((key) => key.kid === decoded.header.kid);

  if (!key) {
    throw new Error("Signing key not found.");
  }

  return jwkToPem(key);
};

exports.handler = async (event) => {
  let identity;

  try {
    const token = getToken(event);

    if (!token) {
      logAuthorizationDecision({
        decision: "deny",
        reason: "Missing bearer token.",
        event,
      });
      return getPolicyDocument("Deny", event.methodArn);
    }

    let claims;

    try {
      claims = verifyConsumerToken(token);
    } catch {
      claims = null;
    }

    if (!claims) {
      const signingKey = await getSigningKey(token);
      claims = jwt.verify(token, signingKey, {
        algorithms: ["RS256"],
      });
    }

    if (claims.token_use && claims.token_use !== "access") {
      throw new Error("Invalid token type.");
    }

    const scopes = parsePermissions(claims);

    if (!validateTokenScopes(scopes)) {
      throw new Error("Invalid token scopes.");
    }

    identity = buildIdentityContext(claims);
    const tenantValidationError = validateTenantClaims(identity);
    if (tenantValidationError) {
      throw new Error(tenantValidationError);
    }

    logAuthorizationDecision({
      decision: "allow",
      reason: "Token validated.",
      event,
      identity,
    });

    return getPolicyDocument("Allow", event.methodArn, identity);
  } catch (error) {
    logAuthorizationDecision({
      decision: "deny",
      reason: error?.message || "Token validation failed.",
      event,
      identity,
    });
    return getPolicyDocument("Deny", event.methodArn);
  }
};
