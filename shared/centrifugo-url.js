const DEFAULT_CENTRIFUGO_URL = "https://realtime.example.invalid";

function isLocalHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isRawAlbHost(hostname) {
  return hostname.endsWith(".elb.amazonaws.com");
}

function normalizeBaseUrl(input, fallback) {
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

function resolveRuntimeCentrifugoUrl({
  stableUrl,
  fallbackUrl,
  defaultUrl = DEFAULT_CENTRIFUGO_URL,
  appName = "app",
}) {
  const stable = String(stableUrl || "").trim();
  const fallback = String(fallbackUrl || "").trim();
  const resolvedDefault = normalizeBaseUrl(defaultUrl, DEFAULT_CENTRIFUGO_URL);

  const candidate = stable || fallback || resolvedDefault;
  const normalized = normalizeBaseUrl(candidate, resolvedDefault);

  if (!stable) {
    try {
      const parsed = new URL(normalized);
      if (isRawAlbHost(parsed.hostname)) {
        console.warn(
          `[${appName}] CENTRIFUGO_URL points to raw ALB host (${parsed.hostname}). Falling back to stable endpoint ${resolvedDefault}. Set STABLE_CENTRIFUGO_URL explicitly to override.`
        );
        return resolvedDefault;
      }
    } catch {
      return resolvedDefault;
    }
  }

  return normalized;
}

module.exports = {
  DEFAULT_CENTRIFUGO_URL,
  normalizeBaseUrl,
  resolveRuntimeCentrifugoUrl,
};
