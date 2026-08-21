function decodeJwtPayload(token) {
  if (typeof token !== "string") {
    return null;
  }

  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payloadJson = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(payloadJson);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function resolveScopedClaims(claims) {
  if (!claims || typeof claims !== "object") {
    return null;
  }

  const accountId = String(claims.accountId || claims.account_id || "").trim();
  const appId = String(claims.appId || claims.application_id || "").trim();

  if (!accountId || !appId) {
    return null;
  }

  return { accountId, appId };
}

function buildScopedChannel({ accountId, appId }) {
  return `flags:acc:${accountId}:app:${appId}`;
}

function createConsumerAuthClient({
  consumerAuthUrl,
  featureFlagsApiUrl,
  clientId,
  clientSecret,
  fetchImpl = fetch,
}) {
  const tokenCache = {
    accessToken: null,
    expiresAtMs: 0,
  };

  const normalizedApiBaseUrl = String(featureFlagsApiUrl || "").replace(/\/$/, "");

  const readCachedToken = () => {
    const now = Date.now();
    if (!tokenCache.accessToken || now >= tokenCache.expiresAtMs - 30_000) {
      return null;
    }

    const claims = decodeJwtPayload(tokenCache.accessToken);
    const scope = resolveScopedClaims(claims);
    if (!claims || !scope) {
      return null;
    }

    return {
      accessToken: tokenCache.accessToken,
      claims,
      accountId: scope.accountId,
      appId: scope.appId,
      expiresAtMs: tokenCache.expiresAtMs,
    };
  };

  const authenticate = async ({ forceRefresh = false } = {}) => {
    if (!forceRefresh) {
      const cached = readCachedToken();
      if (cached) {
        return cached;
      }
    }

    if (!consumerAuthUrl || !clientId || !clientSecret) {
      throw new Error(
        "CONSUMER_AUTH_URL, CONSUMER_CLIENT_ID, and CONSUMER_CLIENT_SECRET are required."
      );
    }

    const authResponse = await fetchImpl(consumerAuthUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientId,
        clientSecret,
      }),
    });

    const authBody = await authResponse.json().catch(() => null);

    if (!authResponse.ok || !authBody?.accessToken) {
      throw new Error(
        authBody?.message || `Consumer auth failed with status ${authResponse.status}`
      );
    }

    const claims = decodeJwtPayload(authBody.accessToken);
    const scope = resolveScopedClaims(claims);
    if (!claims || !scope) {
      throw new Error("Consumer token is missing required account/app scope claims.");
    }

    const expSeconds = Number(claims.exp);
    const expiresAtMs = Number.isFinite(expSeconds)
      ? expSeconds * 1000
      : Date.now() + 15 * 60_000;

    tokenCache.accessToken = authBody.accessToken;
    tokenCache.expiresAtMs = expiresAtMs;

    return {
      accessToken: authBody.accessToken,
      claims,
      accountId: scope.accountId,
      appId: scope.appId,
      expiresAtMs,
    };
  };

  const requestFlagsApi = async (path, options = {}) => {
    if (!normalizedApiBaseUrl) {
      throw new Error("FEATURE_FLAGS_API_URL is not configured.");
    }

    const session = await authenticate();
    const headers = {
      Authorization: `Bearer ${session.accessToken}`,
      ...(options.headers || {}),
    };

    const response = await fetchImpl(`${normalizedApiBaseUrl}${path}`, {
      ...options,
      headers,
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(body?.message || body?.error || `Request failed with status ${response.status}`);
    }

    return body;
  };

  const fetchFlags = async () => {
    const body = await requestFlagsApi("/flags", { method: "GET" });
    return {
      flags: body?.flags || {},
      descriptions: body?.descriptions || {},
      revision: Number(body?.revision) || 0,
      accountId: body?.accountId || null,
      appId: body?.appId || null,
    };
  };

  const upsertFlag = async ({ flagKey, enabled, description }) =>
    requestFlagsApi("/flags", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ flagKey, enabled, description }),
    });

  const deleteFlag = async ({ flagKey }) =>
    requestFlagsApi(`/flags/${encodeURIComponent(flagKey)}`, {
      method: "DELETE",
    });

  return {
    authenticate,
    fetchFlags,
    upsertFlag,
    deleteFlag,
  };
}

module.exports = {
  buildScopedChannel,
  createConsumerAuthClient,
  decodeJwtPayload,
};
