import { Centrifuge } from "centrifuge";

export type FeatureFlagsMode = "bootstrap" | "direct";

export type FeatureFlagValue =
  | boolean
  | string
  | number
  | null
  | FeatureFlagValue[]
  | { [key: string]: FeatureFlagValue };

export type FeatureFlagsConnectionState =
  | "connecting"
  | "live"
  | "reconnecting"
  | "degraded";

export interface FeatureFlagsSnapshot {
  flags: Record<string, FeatureFlagValue>;
  descriptions?: Record<string, string>;
  revision?: number;
  accountId?: string;
  appId?: string;
  channel?: string;
  token?: string;
  centrifugoUrl?: string;
}

export interface FeatureFlagsInitConfig {
  endpoint?: string;
  environment?: string;
  mode?: FeatureFlagsMode;
  clientId?: string;
  clientSecret?: string;
  centrifugoUrl?: string;
  pollIntervalMs?: number;
  tokenManagedSubscriptionRetryMs?: number;
  tokenManagedSafetyResyncMs?: number;
  fetchImpl?: typeof fetch;
  CentrifugeCtor?: CentrifugeConstructor;
}

export interface FeatureFlagsSubscriptionEvent {
  flags: Record<string, FeatureFlagValue>;
  changedKeys: string[];
  connectionState: FeatureFlagsConnectionState;
  initialized: boolean;
}

export interface CentrifugeInstance {
  on(event: string, handler: (...args: any[]) => void): void;
  newSubscription(channel: string): {
    on(event: string, handler: (...args: any[]) => void): void;
    subscribe(): void;
    unsubscribe?(): void;
  };
  getSubscription?(channel: string): ReturnType<CentrifugeInstance["newSubscription"]> | null;
  connect(): void;
  disconnect(): void;
}

export interface CentrifugeConstructor {
  new (
    endpoint: string,
    options: {
      token: string;
      getToken: () => Promise<string>;
    }
  ): CentrifugeInstance;
}

interface InternalState {
  config: Required<
    Pick<
      FeatureFlagsInitConfig,
      "endpoint" | "mode" | "pollIntervalMs" | "tokenManagedSubscriptionRetryMs" | "tokenManagedSafetyResyncMs"
    >
  > &
    Pick<FeatureFlagsInitConfig, "clientId" | "clientSecret" | "centrifugoUrl" | "fetchImpl" | "CentrifugeCtor" | "environment">;
  flags: Record<string, FeatureFlagValue>;
  descriptions: Record<string, string>;
  flagRevisions: Record<string, number>;
  currentRevision: number;
  connectionState: FeatureFlagsConnectionState;
  initialized: boolean;
  tokenCache: {
    accessToken: string;
    expiresAtMs: number;
  };
  listeners: Set<(event: FeatureFlagsSubscriptionEvent) => void>;
  centrifuge: CentrifugeInstance | null;
  subscription: ReturnType<CentrifugeInstance["newSubscription"]> | null;
  fallbackPollTimer: ReturnType<typeof setInterval> | null;
  fallbackPollInFlight: boolean;
  fallbackPollingDisabled: boolean;
  tokenManagedAttachTimer: ReturnType<typeof setTimeout> | null;
  tokenManagedSafetyResyncTimer: ReturnType<typeof setInterval> | null;
  shouldResyncAfterReconnect: boolean;
  hasConnectedOnce: boolean;
  initPromise: Promise<{
    connectionState: FeatureFlagsConnectionState;
    flags: Record<string, FeatureFlagValue>;
    initialized: boolean;
  }> | null;
}

const CONNECTION_STATES = {
  CONNECTING: "connecting",
  LIVE: "live",
  RECONNECTING: "reconnecting",
  DEGRADED: "degraded",
} as const;

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_TOKEN_MANAGED_SUBSCRIPTION_RETRY_MS = 250;
const DEFAULT_TOKEN_MANAGED_SAFETY_RESYNC_MS = 30000;
const DEFAULT_TOKEN_MANAGED_ATTACH_ATTEMPTS = 20;
const DEFAULT_FEATURE_FLAGS_API_URL = "https://api.example.invalid/dev";
const DEFAULT_CENTRIFUGO_URL = "https://realtime.example.invalid";

const INTERNAL_ENVIRONMENT_ENDPOINTS: Record<string, { endpoint: string; centrifugoUrl: string }> = {
  development: {
    endpoint: DEFAULT_FEATURE_FLAGS_API_URL,
    centrifugoUrl: DEFAULT_CENTRIFUGO_URL,
  },
  dev: {
    endpoint: DEFAULT_FEATURE_FLAGS_API_URL,
    centrifugoUrl: DEFAULT_CENTRIFUGO_URL,
  },
};

const state: InternalState = {
  config: {
    endpoint: "",
    mode: "bootstrap",
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    tokenManagedSubscriptionRetryMs: DEFAULT_TOKEN_MANAGED_SUBSCRIPTION_RETRY_MS,
    tokenManagedSafetyResyncMs: DEFAULT_TOKEN_MANAGED_SAFETY_RESYNC_MS,
  },
  flags: {},
  descriptions: {},
  flagRevisions: {},
  currentRevision: 0,
  connectionState: CONNECTION_STATES.CONNECTING,
  initialized: false,
  tokenCache: {
    accessToken: "",
    expiresAtMs: 0,
  },
  listeners: new Set(),
  centrifuge: null,
  subscription: null,
  fallbackPollTimer: null,
  fallbackPollInFlight: false,
  fallbackPollingDisabled: false,
  tokenManagedAttachTimer: null,
  tokenManagedSafetyResyncTimer: null,
  shouldResyncAfterReconnect: false,
  hasConnectedOnce: false,
  initPromise: null,
};

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = String(token || "").split(".")[1];
    if (!payload) {
      return null;
    }

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

    if (typeof atob !== "function") {
      return null;
    }

    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function normalizeBaseUrl(rawUrl: string): string {
  const input = String(rawUrl || "").trim();
  const fallback = resolveDefaultFeatureFlagsEndpoint();
  return (input || fallback).replace(/\/$/, "");
}

function resolveEnvironment(): string {
  const fromWindow = typeof window !== "undefined"
    ? String((window as any).__FF_PROVIDER_ENV__ || "").trim()
    : "";
  const fromProcess = typeof process !== "undefined"
    ? String(process.env.NEXT_PUBLIC_FEATURE_FLAGS_ENV || process.env.FEATURE_FLAGS_ENV || "").trim()
    : "";
  return (fromWindow || fromProcess || "development").toLowerCase();
}

function resolveDefaultFeatureFlagsEndpoint(): string {
  const environment = resolveEnvironment();
  const resolved = INTERNAL_ENVIRONMENT_ENDPOINTS[environment] || INTERNAL_ENVIRONMENT_ENDPOINTS.development;
  return resolved?.endpoint || DEFAULT_FEATURE_FLAGS_API_URL;
}

function joinUrl(baseUrl: string, path: string): string {
  const normalizedPath = String(path || "").trim();
  if (!normalizedPath) {
    return baseUrl;
  }

  if (normalizedPath.startsWith("http://") || normalizedPath.startsWith("https://")) {
    return normalizedPath;
  }

  return `${baseUrl}${normalizedPath.startsWith("/") ? "" : "/"}${normalizedPath}`;
}

function toWebsocketEndpoint(baseUrl: string): string {
  const url = new URL(baseUrl);
  const hostname = url.hostname;
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

  if (url.protocol === "https:" || (url.protocol === "ws:" && !isLocalHost)) {
    url.protocol = "wss:";
  } else if (url.protocol === "http:") {
    url.protocol = "ws:";
  }

  const normalizedPath = url.pathname.replace(/\/$/, "");
  if (!normalizedPath.endsWith("/connection/websocket")) {
    url.pathname = `${normalizedPath}/connection/websocket`;
  } else {
    url.pathname = normalizedPath;
  }

  url.search = "";
  url.hash = "";
  return url.toString();
}

function extractCentrifugoUrlFromRuntimeConfig(): string {
  try {
    const environment = resolveEnvironment();
    const resolved = INTERNAL_ENVIRONMENT_ENDPOINTS[environment] || INTERNAL_ENVIRONMENT_ENDPOINTS.development;
    return (
      String((window as any).__APP_CONFIG__?.centrifugoUrl || "").trim() ||
      resolved?.centrifugoUrl ||
      DEFAULT_CENTRIFUGO_URL
    );
  } catch {
    return DEFAULT_CENTRIFUGO_URL;
  }
}

function setConnectionState(nextState: FeatureFlagsConnectionState): void {
  state.connectionState = nextState;
  notifyListeners([]);
}

function notifyListeners(changedKeys: string[]): void {
  const snapshot: FeatureFlagsSubscriptionEvent = {
    flags: { ...state.flags },
    changedKeys: [...changedKeys],
    connectionState: state.connectionState,
    initialized: state.initialized,
  };

  state.listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      console.error("[consumer-sdk] listener failed", error);
    }
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeFlagValue(value: unknown): FeatureFlagValue {
  if (typeof value === "boolean" || typeof value === "string" || typeof value === "number" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeFlagValue(item));
  }

  if (isPlainObject(value)) {
    const normalized: Record<string, FeatureFlagValue> = {};
    Object.keys(value).forEach((key) => {
      normalized[key] = normalizeFlagValue(value[key]);
    });
    return normalized;
  }

  return Boolean(value);
}

function normalizeFlagsRecord(input: unknown): Record<string, FeatureFlagValue> {
  if (!isPlainObject(input)) {
    return {};
  }

  const normalized: Record<string, FeatureFlagValue> = {};
  Object.keys(input).forEach((flagKey) => {
    normalized[flagKey] = normalizeFlagValue(input[flagKey]);
  });
  return normalized;
}

function valuesEqual(left: FeatureFlagValue | undefined, right: FeatureFlagValue | undefined): boolean {
  if (left === right) {
    return true;
  }

  if (typeof left === "number" && typeof right === "number") {
    return Number.isNaN(left) && Number.isNaN(right);
  }

  if ((Array.isArray(left) || isPlainObject(left)) && (Array.isArray(right) || isPlainObject(right))) {
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return false;
    }
  }

  return false;
}

function readCachedToken(): string | null {
  const now = Date.now();
  if (!state.tokenCache.accessToken || now >= state.tokenCache.expiresAtMs - 30_000) {
    return null;
  }

  return state.tokenCache.accessToken;
}

async function fetchJson(url: string, options: RequestInit): Promise<any> {
  const fetchImpl = state.config.fetchImpl || fetch;
  const response = await fetchImpl(url, options);
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body?.message || body?.error || `${options?.method || "GET"} ${url} failed (${response.status})`;
    throw new Error(message);
  }

  return body || {};
}

async function authenticate(options: { forceRefresh?: boolean } = {}): Promise<string> {
  const forceRefresh = Boolean(options.forceRefresh);
  if (!forceRefresh) {
    const cached = readCachedToken();
    if (cached) {
      return cached;
    }
  }

  const clientId = String(state.config.clientId || "").trim();
  const clientSecret = String(state.config.clientSecret || "").trim();

  if (!clientId || !clientSecret) {
    throw new Error("FeatureFlags direct mode requires clientId and clientSecret");
  }

  const body = await fetchJson(joinUrl(state.config.endpoint, "/consumer/auth"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      clientId,
      clientSecret,
    }),
  });

  const accessToken = String(body?.accessToken || "").trim();
  if (!accessToken) {
    throw new Error("Consumer auth response did not include accessToken");
  }

  const claims = decodeJwtPayload(accessToken);
  const expSeconds = Number((claims || {}).exp);

  state.tokenCache.accessToken = accessToken;
  state.tokenCache.expiresAtMs = Number.isFinite(expSeconds)
    ? expSeconds * 1000
    : Date.now() + 15 * 60_000;

  return accessToken;
}

async function fetchFlagsWithToken(accessToken: string): Promise<FeatureFlagsSnapshot> {
  const body = await fetchJson(joinUrl(state.config.endpoint, "/flags"), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  return {
    flags: normalizeFlagsRecord(body?.flags),
    descriptions: body?.descriptions && typeof body.descriptions === "object" ? body.descriptions : {},
    revision: Number(body?.revision) || 0,
    accountId: String(body?.accountId || "").trim(),
    appId: String(body?.appId || "").trim(),
    channel: String(body?.channel || "").trim(),
    token: accessToken,
  };
}

async function fetchBootstrapSession(options: { forceRefresh?: boolean } = {}): Promise<FeatureFlagsSnapshot> {
  const forceRefresh = Boolean(options.forceRefresh);

  if (state.config.mode === "direct") {
    const bootstrapBody = await fetchJson(joinUrl(state.config.endpoint, "/consumer/bootstrap"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientId: state.config.clientId,
        clientSecret: state.config.clientSecret,
      }),
    }).catch((error) => {
      const message = String(error?.message || "");
      if (
        message.includes("failed (404)") ||
        message.includes("failed (405)") ||
        message.includes("No mocked response for POST /consumer/bootstrap")
      ) {
        return null;
      }
      throw error;
    });

    if (bootstrapBody && typeof bootstrapBody === "object") {
      const accessToken = String(bootstrapBody?.token || bootstrapBody?.accessToken || "").trim();
      if (accessToken) {
        const claims = decodeJwtPayload(accessToken);
        const expSeconds = Number((claims || {}).exp);
        state.tokenCache.accessToken = accessToken;
        state.tokenCache.expiresAtMs = Number.isFinite(expSeconds)
          ? expSeconds * 1000
          : Date.now() + 15 * 60_000;
      }

      return {
        token: accessToken,
        flags: normalizeFlagsRecord(bootstrapBody?.flags),
        descriptions: bootstrapBody?.descriptions && typeof bootstrapBody.descriptions === "object" ? bootstrapBody.descriptions : {},
        revision: Number(bootstrapBody?.revision) || 0,
        accountId: String(bootstrapBody?.accountId || "").trim(),
        appId: String(bootstrapBody?.appId || "").trim(),
        channel: String(bootstrapBody?.channel || "").trim(),
        centrifugoUrl:
          String(bootstrapBody?.centrifugoUrl || "").trim() ||
          String(state.config.centrifugoUrl || "").trim() ||
          extractCentrifugoUrlFromRuntimeConfig() ||
          DEFAULT_CENTRIFUGO_URL,
      };
    }

    const accessToken = await authenticate({ forceRefresh });
    const snapshot = await fetchFlagsWithToken(accessToken);
    snapshot.centrifugoUrl =
      String(state.config.centrifugoUrl || "").trim() ||
      extractCentrifugoUrlFromRuntimeConfig() ||
      DEFAULT_CENTRIFUGO_URL;
    return snapshot;
  }

  const body = await fetchJson(joinUrl(state.config.endpoint, "/realtime/bootstrap"), {
    method: "GET",
    cache: "no-store",
  });

  return {
    token: String(body?.token || "").trim(),
    flags: normalizeFlagsRecord(body?.flags),
    descriptions: body?.descriptions && typeof body.descriptions === "object" ? body.descriptions : {},
    revision: Number(body?.revision) || 0,
    accountId: String(body?.accountId || "").trim(),
    appId: String(body?.appId || "").trim(),
    channel: String(body?.channel || "").trim(),
    centrifugoUrl:
      String(body?.centrifugoUrl || "").trim() ||
      String(state.config.centrifugoUrl || "").trim() ||
      extractCentrifugoUrlFromRuntimeConfig() ||
      DEFAULT_CENTRIFUGO_URL,
  };
}

function applySnapshot(snapshot: FeatureFlagsSnapshot): boolean {
  if (!snapshot || !snapshot.flags || typeof snapshot.flags !== "object") {
    return false;
  }

  const parsedRevision = Number(snapshot.revision);
  const snapshotRevision = Number.isFinite(parsedRevision) && parsedRevision >= 0 ? parsedRevision : 0;
  if (snapshotRevision < state.currentRevision) {
    return false;
  }

  const previousFlags = state.flags;
  const nextFlags = { ...snapshot.flags };
  const changedKeys = new Set<string>();

  Object.keys(previousFlags).forEach((flagKey) => {
    if (!(flagKey in nextFlags)) {
      changedKeys.add(flagKey);
    }
  });

  Object.keys(nextFlags).forEach((flagKey) => {
    if (!valuesEqual(previousFlags[flagKey], nextFlags[flagKey])) {
      changedKeys.add(flagKey);
    }
  });

  state.currentRevision = snapshotRevision;
  state.flags = nextFlags;
  state.initialized = true;

  if (snapshot.descriptions && typeof snapshot.descriptions === "object") {
    state.descriptions = { ...snapshot.descriptions };
  }

  const nextFlagRevisions: Record<string, number> = {};
  Object.keys(nextFlags).forEach((flagKey) => {
    nextFlagRevisions[flagKey] = snapshotRevision;
  });
  state.flagRevisions = nextFlagRevisions;

  notifyListeners([...changedKeys]);
  return true;
}

function applyDeltaPayload(payload: any): boolean {
  if (!payload || !Array.isArray(payload.changes)) {
    return false;
  }

  const payloadRevision = Number(payload.revision) || 0;
  const nextFlags = { ...state.flags };
  const changedKeys: string[] = [];
  let hasChanges = false;
  let maxRevision = Math.max(state.currentRevision, payloadRevision);

  payload.changes.forEach((change: any) => {
    if (!change || typeof change.flagKey !== "string") {
      return;
    }

    const parsedChangeRevision = Number(change.revision);
    const changeRevision = Number.isFinite(parsedChangeRevision) && parsedChangeRevision >= 0
      ? parsedChangeRevision
      : payloadRevision;
    const previousRevision = Number(state.flagRevisions[change.flagKey]) || 0;

    if (changeRevision < previousRevision) {
      return;
    }

    maxRevision = Math.max(maxRevision, changeRevision);

    if (change.deleted) {
      if (change.flagKey in nextFlags) {
        delete nextFlags[change.flagKey];
        hasChanges = true;
        changedKeys.push(change.flagKey);
      }
      delete state.flagRevisions[change.flagKey];
      delete state.descriptions[change.flagKey];
      return;
    }

    const nextValue = Object.prototype.hasOwnProperty.call(change, "value")
      ? normalizeFlagValue(change.value)
      : normalizeFlagValue(change.enabled);
    if (!valuesEqual(nextFlags[change.flagKey], nextValue)) {
      hasChanges = true;
      changedKeys.push(change.flagKey);
    }

    nextFlags[change.flagKey] = nextValue;
    state.flagRevisions[change.flagKey] = changeRevision;
    if (typeof change.description === "string") {
      state.descriptions[change.flagKey] = change.description;
    }
  });

  if (!hasChanges) {
    return false;
  }

  state.currentRevision = maxRevision;
  state.flags = nextFlags;
  notifyListeners(changedKeys);
  return true;
}

function applyRealtimePayload(payload: any): boolean {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  if (payload.flags) {
    return applySnapshot(payload);
  }

  if (payload.changes) {
    return applyDeltaPayload(payload);
  }

  return false;
}

async function fetchLatestSnapshot(): Promise<void> {
  if (state.config.mode === "direct") {
    const accessToken = await authenticate();
    const snapshot = await fetchFlagsWithToken(accessToken);
    applySnapshot(snapshot);
    return;
  }

  const body = await fetchJson(joinUrl(state.config.endpoint, "/flags"), {
    method: "GET",
    cache: "no-store",
  });

  applySnapshot(body);
}

async function refreshSnapshotAfterReconnect(): Promise<void> {
  if (!state.shouldResyncAfterReconnect) {
    return;
  }

  await fetchLatestSnapshot();
  state.shouldResyncAfterReconnect = false;
}

function setupFallbackPolling(): void {
  if (state.fallbackPollTimer) {
    clearInterval(state.fallbackPollTimer);
    state.fallbackPollTimer = null;
  }

  state.fallbackPollTimer = setInterval(() => {
    if (state.fallbackPollingDisabled) {
      return;
    }

    const shouldPoll =
      state.connectionState === CONNECTION_STATES.DEGRADED ||
      state.connectionState === CONNECTION_STATES.RECONNECTING;

    if (!shouldPoll) {
      return;
    }

    if (state.fallbackPollInFlight) {
      return;
    }

    state.fallbackPollInFlight = true;
    fetchLatestSnapshot()
      .catch((error) => {
        console.error("[consumer-sdk] fallback snapshot poll error", error);
        if (String(error?.message || "").includes("failed (404)")) {
          state.fallbackPollingDisabled = true;
        }
      })
      .finally(() => {
        state.fallbackPollInFlight = false;
      });
  }, state.config.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS);
}

async function connectRealtime(): Promise<void> {
  const CentrifugeCtor =
    state.config.CentrifugeCtor || (Centrifuge as unknown as CentrifugeConstructor);

  if (!CentrifugeCtor) {
    throw new Error("Centrifuge SDK is not available. Provide window.Centrifuge or init({ CentrifugeCtor })");
  }

  let session = await fetchBootstrapSession();
  if (!session.token) {
    throw new Error("Bootstrap did not return a token");
  }

  applySnapshot(session);

  const centrifugoUrl = String(session.centrifugoUrl || "").trim();
  if (!centrifugoUrl) {
    throw new Error("Centrifugo URL missing. Provide init({ centrifugoUrl }) or bootstrap centrifugoUrl");
  }

  const centrifuge = new CentrifugeCtor(toWebsocketEndpoint(centrifugoUrl), {
    token: session.token,
    getToken: async () => {
      const nextSession = await fetchBootstrapSession({ forceRefresh: true });
      session = nextSession;
      if (nextSession.token) {
        applySnapshot(nextSession);
      }
      return nextSession.token || "";
    },
  });

  state.centrifuge = centrifuge;

  const claims = decodeJwtPayload(session.token);
  const accountId = String(session.accountId || claims?.accountId || "").trim();
  const appId = String(session.appId || claims?.appId || "").trim();
  const channel = String(session.channel || "").trim() ||
    (accountId && appId ? `flags:acc:${accountId}:app:${appId}` : "");
  const tokenSubscriptions = claims?.subs && typeof claims.subs === "object" ? claims.subs : {};
  const tokenManaged = channel && Object.prototype.hasOwnProperty.call(tokenSubscriptions, channel);
  let subscription: ReturnType<CentrifugeInstance["newSubscription"]> | null = null;
  let subscriptionListenerAttached = false;

  const clearTokenManagedAttachTimer = () => {
    if (state.tokenManagedAttachTimer) {
      clearTimeout(state.tokenManagedAttachTimer);
      state.tokenManagedAttachTimer = null;
    }
  };

  const clearTokenManagedSafetyResyncTimer = () => {
    if (state.tokenManagedSafetyResyncTimer) {
      clearInterval(state.tokenManagedSafetyResyncTimer);
      state.tokenManagedSafetyResyncTimer = null;
    }
  };

  const attachSubscriptionListener = (candidate: ReturnType<CentrifugeInstance["newSubscription"]> | null) => {
    if (!candidate || subscriptionListenerAttached) {
      return;
    }

    subscription = candidate;
    state.subscription = candidate;
    subscriptionListenerAttached = true;
    clearTokenManagedAttachTimer();
    clearTokenManagedSafetyResyncTimer();
    candidate.on("publication", handlePublication);
  };

  const createFallbackSubscription = () => {
    if (tokenManaged || subscription || !channel) {
      return;
    }

    const createdSubscription = centrifuge.newSubscription(channel);
    attachSubscriptionListener(createdSubscription);
    if (createdSubscription) {
      createdSubscription.subscribe();
    }
  };

  const startTokenManagedSafetyResync = () => {
    if (!tokenManaged || subscriptionListenerAttached || state.tokenManagedSafetyResyncTimer) {
      return;
    }

    const intervalMs = state.config.tokenManagedSafetyResyncMs;
    if (intervalMs <= 0) {
      return;
    }

    state.tokenManagedSafetyResyncTimer = setInterval(() => {
      if (subscriptionListenerAttached) {
        clearTokenManagedSafetyResyncTimer();
        return;
      }

      if (state.connectionState !== CONNECTION_STATES.LIVE) {
        return;
      }

      fetchLatestSnapshot().catch((error) => {
        console.error("[consumer-sdk] token-managed safety resync failed", error);
      });
    }, intervalMs);
  };

  const scheduleTokenManagedAttach = (attempt = 0) => {
    if (!tokenManaged || subscriptionListenerAttached || !channel) {
      return;
    }

    const managedSubscription = centrifuge.getSubscription?.(channel) || null;
    if (managedSubscription) {
      attachSubscriptionListener(managedSubscription);
      return;
    }

    if (attempt >= DEFAULT_TOKEN_MANAGED_ATTACH_ATTEMPTS) {
      console.warn("[consumer-sdk] token-managed subscription unavailable after retries");
      startTokenManagedSafetyResync();
      return;
    }

    const retryMs = state.config.tokenManagedSubscriptionRetryMs;
    state.tokenManagedAttachTimer = setTimeout(() => {
      scheduleTokenManagedAttach(attempt + 1);
    }, retryMs);
  };

  centrifuge.on("connecting", () => {
    if (state.hasConnectedOnce) {
      state.shouldResyncAfterReconnect = true;
      setConnectionState(CONNECTION_STATES.RECONNECTING);
      return;
    }

    setConnectionState(CONNECTION_STATES.CONNECTING);
  });

  centrifuge.on("connected", () => {
    const didReconnect = state.hasConnectedOnce;
    state.hasConnectedOnce = true;
    setConnectionState(CONNECTION_STATES.LIVE);
    if (tokenManaged) {
      scheduleTokenManagedAttach();
      startTokenManagedSafetyResync();
    } else {
      createFallbackSubscription();
    }

    if (didReconnect && state.shouldResyncAfterReconnect) {
      refreshSnapshotAfterReconnect().catch((error) => {
        console.error("[consumer-sdk] post reconnect resync failed", error);
      });
    }
  });

  centrifuge.on("disconnected", () => {
    setConnectionState(CONNECTION_STATES.DEGRADED);
  });

  centrifuge.on("error", (ctx) => {
    console.error("[consumer-sdk] centrifuge error", ctx);
  });

  const handlePublication = (ctx: { data: any }) => {
    const incomingRevision = Number(ctx?.data?.revision) || 0;
    setConnectionState(CONNECTION_STATES.LIVE);
    const wasApplied = applyRealtimePayload(ctx && ctx.data);
    if (!wasApplied && incomingRevision > state.currentRevision) {
      console.warn("[consumer-sdk] revision gap detected, triggering resync");
      fetchLatestSnapshot().catch((error) => {
        console.error("[consumer-sdk] revision-gap resync failed", error);
      });
    }
  };

  centrifuge.on("publication", handlePublication);
  centrifuge.connect();
}

export async function init(config: FeatureFlagsInitConfig): Promise<{
  connectionState: FeatureFlagsConnectionState;
  flags: Record<string, FeatureFlagValue>;
  initialized: boolean;
}> {
  const mode: FeatureFlagsMode = config.mode || (config.clientId && config.clientSecret ? "direct" : "bootstrap");

  const normalizedConfig = {
    endpoint: normalizeBaseUrl(config.endpoint || ""),
    environment: String(config.environment || resolveEnvironment()).trim() || "development",
    mode,
    clientId: String(config.clientId || "").trim(),
    clientSecret: String(config.clientSecret || "").trim(),
    centrifugoUrl: String(config.centrifugoUrl || "").trim(),
    pollIntervalMs: Number(config.pollIntervalMs) || DEFAULT_POLL_INTERVAL_MS,
    tokenManagedSubscriptionRetryMs: Number(config.tokenManagedSubscriptionRetryMs) || DEFAULT_TOKEN_MANAGED_SUBSCRIPTION_RETRY_MS,
    tokenManagedSafetyResyncMs: Number(config.tokenManagedSafetyResyncMs) || DEFAULT_TOKEN_MANAGED_SAFETY_RESYNC_MS,
    fetchImpl: config.fetchImpl,
    CentrifugeCtor: config.CentrifugeCtor,
  };

  if (mode === "direct" && (!normalizedConfig.clientId || !normalizedConfig.clientSecret)) {
    throw new Error("FeatureFlags direct mode requires clientId and clientSecret");
  }

  if (state.initPromise) {
    const sameConfig =
      state.config.endpoint === normalizedConfig.endpoint &&
      state.config.mode === normalizedConfig.mode &&
      state.config.clientId === normalizedConfig.clientId &&
      state.config.clientSecret === normalizedConfig.clientSecret &&
      state.config.centrifugoUrl === normalizedConfig.centrifugoUrl &&
      state.config.tokenManagedSubscriptionRetryMs === normalizedConfig.tokenManagedSubscriptionRetryMs &&
      state.config.tokenManagedSafetyResyncMs === normalizedConfig.tokenManagedSafetyResyncMs;

    if (sameConfig) {
      return state.initPromise;
    }

    shutdown();
  }

  state.config = normalizedConfig;
  state.fallbackPollingDisabled = false;
  setConnectionState(CONNECTION_STATES.CONNECTING);

  state.initPromise = (async () => {
    setupFallbackPolling();
    await connectRealtime();
    return {
      connectionState: state.connectionState,
      flags: { ...state.flags },
      initialized: state.initialized,
    };
  })().catch((error) => {
    setConnectionState(CONNECTION_STATES.DEGRADED);
    state.initPromise = null;
    throw error;
  });

  return state.initPromise;
}

export function isEnabled(flagKey: string): boolean {
  const key = String(flagKey || "").trim();
  if (!key) {
    return false;
  }

  return typeof state.flags[key] === "boolean" ? state.flags[key] : false;
}

export function subscribe(listener: (event: FeatureFlagsSubscriptionEvent) => void): () => void {
  if (typeof listener !== "function") {
    throw new Error("FeatureFlags.subscribe requires a function listener");
  }

  state.listeners.add(listener);
  listener({
    flags: { ...state.flags },
    changedKeys: [],
    connectionState: state.connectionState,
    initialized: state.initialized,
  });

  return function unsubscribe() {
    state.listeners.delete(listener);
  };
}

export function getFlags(): Record<string, FeatureFlagValue> {
  return { ...state.flags };
}

export function getConnectionState(): FeatureFlagsConnectionState {
  return state.connectionState;
}

export function isInitialized(): boolean {
  return state.initialized;
}

export function shutdown(): void {
  if (state.tokenManagedAttachTimer) {
    clearTimeout(state.tokenManagedAttachTimer);
    state.tokenManagedAttachTimer = null;
  }

  if (state.tokenManagedSafetyResyncTimer) {
    clearInterval(state.tokenManagedSafetyResyncTimer);
    state.tokenManagedSafetyResyncTimer = null;
  }

  if (state.fallbackPollTimer) {
    clearInterval(state.fallbackPollTimer);
  state.fallbackPollTimer = null;
  state.fallbackPollInFlight = false;
  state.fallbackPollingDisabled = false;
  }

  if (state.centrifuge && typeof state.centrifuge.disconnect === "function") {
    state.centrifuge.disconnect();
  }

  if (state.subscription && typeof state.subscription.unsubscribe === "function") {
    state.subscription.unsubscribe();
  }
  state.subscription = null;
  state.centrifuge = null;
  state.shouldResyncAfterReconnect = false;
  state.hasConnectedOnce = false;
  state.connectionState = CONNECTION_STATES.DEGRADED;
  state.initialized = false;
  state.initPromise = null;
  state.flags = {};
  state.descriptions = {};
  state.flagRevisions = {};
  state.currentRevision = 0;
  state.tokenCache.accessToken = "";
  state.tokenCache.expiresAtMs = 0;
}

export const FeatureFlags = {
  init,
  isEnabled,
  subscribe,
  getFlags,
  getConnectionState,
  isInitialized,
  shutdown,
  CONNECTION_STATES,
};
