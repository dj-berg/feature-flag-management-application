import assert from "node:assert/strict";

export function encodeJwt(payload) {
  const header = { alg: "none", typ: "JWT" };
  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  return `${encodedHeader}.${encodedPayload}.`;
}

function toBase64Url(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function createFetchMock(routes) {
  const calls = [];

  const fetchMock = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const parsed = new URL(url);
    const key = `${String(init.method || "GET").toUpperCase()} ${parsed.pathname}`;
    const queue = routes[key] || [];
    if (!queue.length) {
      throw new Error(`No mocked response for ${key}`);
    }

    const next = queue.shift();
    calls.push({ key, url, init });

    return {
      ok: next.ok !== false,
      status: next.status || 200,
      json: async () => next.body,
    };
  };

  fetchMock.calls = calls;
  return fetchMock;
}

export function installWindowLike(origin = "http://localhost:3001") {
  globalThis.window = {
    location: { origin },
    __APP_CONFIG__: {},
  };

  if (globalThis.process && typeof globalThis.process === "object") {
    globalThis.process.env = {};
  }

  globalThis.atob = (value) => Buffer.from(value, "base64").toString("binary");
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FakeCentrifuge {
  static instances = [];

  constructor(endpoint, options) {
    this.endpoint = endpoint;
    this.options = options;
    this.handlers = new Map();
    this.subscriptions = new Map();
    this.tokenSubscriptions = new Map();
    this.materializedTokenChannels = new Set();
    this.disconnected = false;
    FakeCentrifuge.instances.push(this);
  }

  newSubscription(channel) {
    const handlers = new Map();
    const subscription = {
      channel,
      subscribeCalls: 0,
      on: (event, handler) => {
        const eventHandlers = handlers.get(event) || [];
        eventHandlers.push(handler);
        handlers.set(event, eventHandlers);
      },
       subscribe: () => {
         subscription.subscribeCalls += 1;
       },
      emit: (event, payload) => {
        (handlers.get(event) || []).forEach((handler) => handler(payload));
      },
    };
    this.subscriptions.set(channel, subscription);
    return subscription;
  }

  getSubscription(channel) {
    if (!this.materializedTokenChannels.has(channel)) {
      return null;
    }

    if (!this.tokenSubscriptions.has(channel)) {
      const handlers = new Map();
      this.tokenSubscriptions.set(channel, {
        channel,
        subscribe: () => {},
        on: (event, handler) => {
          const eventHandlers = handlers.get(event) || [];
          eventHandlers.push(handler);
          handlers.set(event, eventHandlers);
        },
        emit: (event, payload) => {
          (handlers.get(event) || []).forEach((handler) => handler(payload));
        },
      });
    }
    return this.tokenSubscriptions.get(channel);
  }

  on(event, handler) {
    const handlers = this.handlers.get(event) || [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
  }

  emit(event, payload) {
    const handlers = this.handlers.get(event) || [];
    handlers.forEach((handler) => handler(payload));
  }

  connect() {
    const token = this.options?.token || "";
    try {
      const payloadPart = String(token).split(".")[1] || "";
      if (payloadPart) {
        const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
        const claims = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
        const subs = claims?.subs && typeof claims.subs === "object" ? claims.subs : {};
        Object.keys(subs).forEach((channel) => {
          this.materializedTokenChannels.add(channel);
        });
      }
    } catch {
      // ignore test token parsing errors
    }

    this.emit("connecting", { reason: "initial" });
    this.emit("connected", {});
  }

  emitSubscriptionPublication(channel, payload) {
    (this.subscriptions.get(channel) || this.tokenSubscriptions.get(channel))?.emit("publication", payload);
  }

  disconnect() {
    this.disconnected = true;
  }
}

export function getLastCentrifuge() {
  assert.ok(FakeCentrifuge.instances.length > 0, "Expected at least one fake centrifuge instance");
  return FakeCentrifuge.instances[FakeCentrifuge.instances.length - 1];
}

export function resetFakes() {
  FakeCentrifuge.instances = [];
}
