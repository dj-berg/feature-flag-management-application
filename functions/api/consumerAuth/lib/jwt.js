const jwt = require("jsonwebtoken");

const DEFAULT_LIFESPAN_SECONDS = 900;

const normalizeExpiresIn = (expiresInSeconds) => {
  const parsed = Number(expiresInSeconds);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIFESPAN_SECONDS;
  }
  return Math.floor(parsed);
};

const hasSubscribePermission = (permissions) =>
  Array.isArray(permissions) && permissions.includes("flags:subscribe");

const createScopedConsumerToken = ({
  accountId,
  appId,
  environment,
  permissions,
  issuer,
  audience,
  privateKey,
  keyId,
  expiresInSeconds,
}) => {
  const now = Math.floor(Date.now() / 1000);
  const lifespan = normalizeExpiresIn(expiresInSeconds);
  const subject = `app:${accountId}:${appId}`;

  const payload = {
    token_type: "consumer",
    accountId,
    appId,
    environment,
    permissions,
    scope: Array.isArray(permissions) ? permissions.join(" ") : "",
  };

  if (hasSubscribePermission(permissions)) {
    const channel = `flags:acc:${accountId}:app:${appId}`;
    payload.channels = [channel];
    payload.subs = {
      [channel]: {},
    };
  }

  return jwt.sign(payload, privateKey, {
    algorithm: "RS256",
    issuer,
    audience,
    subject,
    expiresIn: lifespan,
    notBefore: 0,
    keyid: keyId,
    jwtid: `${accountId}:${appId}:${now}`,
  });
};

const getTokenLifespanSeconds = (token) => {
  const decoded = jwt.decode(token);

  if (!decoded || typeof decoded !== "object" || !decoded.exp || !decoded.iat) {
    return DEFAULT_LIFESPAN_SECONDS;
  }

  const lifespan = Number(decoded.exp) - Number(decoded.iat);
  return Number.isFinite(lifespan) && lifespan > 0
    ? Math.floor(lifespan)
    : DEFAULT_LIFESPAN_SECONDS;
};

module.exports = {
  createScopedConsumerToken,
  getTokenLifespanSeconds,
};
