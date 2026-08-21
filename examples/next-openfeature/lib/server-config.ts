const DEFAULT_CENTRIFUGO_URL = "https://realtime.example.invalid";

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isRawAlbHost(hostname: string): boolean {
  return hostname.endsWith(".elb.amazonaws.com");
}

function normalizeBaseUrl(input: string | undefined, fallback: string): string {
  const fallbackValue = String(fallback || DEFAULT_CENTRIFUGO_URL).trim() || DEFAULT_CENTRIFUGO_URL;
  const candidate = String(input || "").trim() || fallbackValue;

  try {
    const url = new URL(candidate);
    const local = isLocalHost(url.hostname);

    if (url.protocol === "wss:") {
      url.protocol = "https:";
    } else if (url.protocol === "ws:") {
      url.protocol = local ? "http:" : "https:";
    } else if (url.protocol === "http:" && !local) {
      url.protocol = "https:";
    }

    const path = url.pathname.replace(/\/+$/, "");
    url.pathname = path.endsWith("/connection/websocket")
      ? path.slice(0, -"/connection/websocket".length) || "/"
      : path || "/";

    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return fallbackValue;
  }
}

function resolveRuntimeCentrifugoUrl(stableUrl?: string, fallbackUrl?: string): string {
  const stable = String(stableUrl || "").trim();
  const fallback = String(fallbackUrl || "").trim();
  const resolvedDefault = normalizeBaseUrl(DEFAULT_CENTRIFUGO_URL, DEFAULT_CENTRIFUGO_URL);

  const candidate = stable || fallback || resolvedDefault;
  const normalized = normalizeBaseUrl(candidate, resolvedDefault);

  if (!stable) {
    try {
      const parsed = new URL(normalized);
      if (isRawAlbHost(parsed.hostname)) {
        return resolvedDefault;
      }
    } catch {
      return resolvedDefault;
    }
  }

  return normalized;
}

function requireValue(name: string): string {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function getServerBootstrapConfig() {
  const featureFlagsApiUrl = requireValue("FEATURE_FLAGS_API_URL").replace(/\/$/, "");
  const clientId = requireValue("FF_CLIENT_ID");
  const clientSecret = requireValue("FF_CLIENT_SECRET");

  const centrifugoBaseUrl = resolveRuntimeCentrifugoUrl(
    process.env.STABLE_CENTRIFUGO_URL,
    process.env.CENTRIFUGO_URL,
  );

  return {
    featureFlagsApiUrl,
    consumerAuthUrl: `${featureFlagsApiUrl}/consumer/auth`,
    clientId,
    clientSecret,
    centrifugoBaseUrl,
  };
}
