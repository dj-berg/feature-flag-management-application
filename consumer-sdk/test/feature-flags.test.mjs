import test from "node:test";
import assert from "node:assert/strict";

import {
  createFetchMock,
  encodeJwt,
  FakeCentrifuge,
  getLastCentrifuge,
  installWindowLike,
  resetFakes,
  sleep,
} from "./helpers.mjs";

function nowInSeconds(offset = 600) {
  return Math.floor(Date.now() / 1000) + offset;
}

async function loadSdk() {
  return import("../dist/index.js");
}

test("applies snapshot and realtime delta updates", async () => {
  resetFakes();
  installWindowLike();

  const token = encodeJwt({
    exp: nowInSeconds(),
    accountId: "acc-local-ui",
    appId: "app-local-ui",
    subs: { "flags:acc:acc-local-ui:app:app-local-ui": {} },
  });
  const fetchMock = createFetchMock({
    "GET /realtime/bootstrap": [
      {
        body: {
          token,
          flags: { "instant-transfers": true, "travel-notifications": false },
          revision: 1,
        },
      },
    ],
  });

  const sdkModule = await loadSdk();
  const { FeatureFlags } = sdkModule;

  const events = [];
  const unsubscribe = FeatureFlags.subscribe((event) => {
    events.push(event);
  });

  try {
    await FeatureFlags.init({
      endpoint: "http://localhost:3001",
      mode: "bootstrap",
      fetchImpl: fetchMock,
      CentrifugeCtor: FakeCentrifuge,
      pollIntervalMs: 10000,
    });

    assert.equal(FeatureFlags.isEnabled("instant-transfers"), true);
    assert.equal(FeatureFlags.isEnabled("travel-notifications"), false);
    assert.equal(FeatureFlags.isInitialized(), true);

    const centrifuge = getLastCentrifuge();
    centrifuge.emitSubscriptionPublication("flags:acc:acc-local-ui:app:app-local-ui", {
      data: {
        revision: 2,
        changes: [{ flagKey: "travel-notifications", enabled: true, revision: 2 }],
      },
    });

    assert.equal(FeatureFlags.isEnabled("travel-notifications"), true);
    assert.ok(events.length >= 2);
  } finally {
    unsubscribe();
    FeatureFlags.shutdown();
    assert.equal(FeatureFlags.isInitialized(), false);
  }
});

test("applies a realtime delta after bootstrap preserves the backend revision", async () => {
  resetFakes();
  installWindowLike();

  const token = encodeJwt({
    exp: nowInSeconds(),
    accountId: "acc-local-ui",
    appId: "app-local-ui",
    subs: { "flags:acc:acc-local-ui:app:app-local-ui": {} },
  });
  const fetchMock = createFetchMock({
    "GET /realtime/bootstrap": [{
      body: {
        token,
        flags: { "job-explorer-apply-now": true },
        revision: 100,
      },
    }],
  });

  const { FeatureFlags } = await loadSdk();

  try {
    await FeatureFlags.init({
      endpoint: "http://localhost:3001",
      mode: "bootstrap",
      fetchImpl: fetchMock,
      CentrifugeCtor: FakeCentrifuge,
    });

    getLastCentrifuge().emitSubscriptionPublication(
      "flags:acc:acc-local-ui:app:app-local-ui",
      { data: { revision: 101, changes: [{ flagKey: "job-explorer-apply-now", enabled: false, revision: 101 }] } },
    );

    assert.equal(FeatureFlags.isEnabled("job-explorer-apply-now"), false);
  } finally {
    FeatureFlags.shutdown();
  }
});

test("applies a realtime update when bootstrap revision is zero", async () => {
  resetFakes();
  installWindowLike();

  const token = encodeJwt({
    exp: nowInSeconds(),
    accountId: "acc-local-ui",
    appId: "app-local-ui",
    subs: { "flags:acc:acc-local-ui:app:app-local-ui": {} },
  });
  const fetchMock = createFetchMock({
    "GET /realtime/bootstrap": [{
      body: {
        token,
        flags: { "job-explorer-apply-now": true },
        revision: 0,
      },
    }],
  });

  const { FeatureFlags } = await loadSdk();

  try {
    await FeatureFlags.init({
      endpoint: "http://localhost:3001",
      mode: "bootstrap",
      fetchImpl: fetchMock,
      CentrifugeCtor: FakeCentrifuge,
    });

    getLastCentrifuge().emitSubscriptionPublication("flags:acc:acc-local-ui:app:app-local-ui", {
      data: {
        revision: 1,
        changes: [{ flagKey: "job-explorer-apply-now", enabled: false, revision: 1 }],
      },
    });

    assert.equal(FeatureFlags.isEnabled("job-explorer-apply-now"), false);
  } finally {
    FeatureFlags.shutdown();
  }
});

test("applies delta when change revision equals bootstrap revision", async () => {
  resetFakes();
  installWindowLike();

  const channel = "flags:acc:acc-local-ui:app:app-local-ui";
  const token = encodeJwt({ exp: nowInSeconds(), accountId: "acc-local-ui", appId: "app-local-ui", subs: { [channel]: {} } });
  const fetchMock = createFetchMock({
    "GET /realtime/bootstrap": [{
      body: {
        token,
        flags: { "job-explorer-apply-now": false },
        revision: 42,
      },
    }],
  });

  const { FeatureFlags } = await loadSdk();
  try {
    await FeatureFlags.init({ endpoint: "http://localhost:3001", fetchImpl: fetchMock, CentrifugeCtor: FakeCentrifuge });

    getLastCentrifuge().emitSubscriptionPublication(channel, {
      data: {
        revision: 42,
        changes: [{ flagKey: "job-explorer-apply-now", enabled: true, revision: 42 }],
      },
    });

    assert.equal(FeatureFlags.isEnabled("job-explorer-apply-now"), true);
  } finally {
    FeatureFlags.shutdown();
  }
});

test("reconnect triggers snapshot resync", async () => {
  resetFakes();
  installWindowLike();

  const token = encodeJwt({ exp: nowInSeconds() });
  const fetchMock = createFetchMock({
    "GET /realtime/bootstrap": [
      {
        body: {
          token,
          flags: { "instant-transfers": true },
          revision: 1,
        },
      },
      {
        body: {
          token,
          flags: { "instant-transfers": true },
          revision: 1,
        },
      },
    ],
    "GET /flags": [
      {
        body: {
          flags: { "instant-transfers": false },
          revision: 3,
        },
      },
    ],
  });

  const sdkModule = await loadSdk();
  const { FeatureFlags } = sdkModule;

  try {
    await FeatureFlags.init({
      endpoint: "http://localhost:3001",
      mode: "bootstrap",
      fetchImpl: fetchMock,
      CentrifugeCtor: FakeCentrifuge,
      pollIntervalMs: 10000,
    });

    const centrifuge = getLastCentrifuge();
    centrifuge.emit("connecting", { reason: "network" });
    centrifuge.emit("connected", {});

    await sleep(0);
    assert.equal(FeatureFlags.isEnabled("instant-transfers"), false);
  } finally {
    FeatureFlags.shutdown();
  }
});

test("direct mode re-authenticates and refreshes token", async () => {
  resetFakes();
  installWindowLike();

  const tokenA = encodeJwt({ exp: nowInSeconds(-10) });
  const tokenB = encodeJwt({ exp: nowInSeconds(600) });

  const fetchMock = createFetchMock({
    "POST /consumer/auth": [
      { body: { accessToken: tokenA } },
      { body: { accessToken: tokenB } },
    ],
    "GET /flags": [
      {
        body: {
          flags: { "instant-transfers": true },
          revision: 1,
        },
      },
      {
        body: {
          flags: { "instant-transfers": false },
          revision: 2,
        },
      },
    ],
  });

  const sdkModule = await loadSdk();
  const { FeatureFlags } = sdkModule;

  try {
    await FeatureFlags.init({
      endpoint: "http://localhost:3001",
      mode: "direct",
      clientId: "client",
      clientSecret: "secret",
      fetchImpl: fetchMock,
      CentrifugeCtor: FakeCentrifuge,
      centrifugoUrl: "http://centrifugo.local",
      pollIntervalMs: 10000,
    });

    const centrifuge = getLastCentrifuge();
    await centrifuge.options.getToken();

    const authCalls = fetchMock.calls.filter((call) => call.key === "POST /consumer/auth");
    assert.equal(authCalls.length, 2);
    assert.equal(FeatureFlags.isEnabled("instant-transfers"), false);
  } finally {
    FeatureFlags.shutdown();
  }
});

test("stays live without fallback polling while websocket is healthy", async () => {
  resetFakes();
  installWindowLike();

  const token = encodeJwt({ exp: nowInSeconds() });
  const fetchMock = createFetchMock({
    "GET /realtime/bootstrap": [
      {
        body: {
          token,
          flags: { "instant-transfers": true },
          revision: 1,
        },
      },
    ],
    "GET /flags": [
      { body: { flags: { "instant-transfers": true }, revision: 1 } },
      { body: { flags: { "instant-transfers": true }, revision: 1 } },
    ],
  });

  const sdkModule = await loadSdk();
  const { FeatureFlags } = sdkModule;

  try {
    await FeatureFlags.init({
      endpoint: "http://localhost:3001",
      mode: "bootstrap",
      fetchImpl: fetchMock,
      CentrifugeCtor: FakeCentrifuge,
      pollIntervalMs: 20,
    });

    await sleep(75);

    const pollingCalls = fetchMock.calls.filter((call) => call.key === "GET /flags");
    assert.equal(pollingCalls.length, 0);
    assert.equal(FeatureFlags.getConnectionState(), "live");
  } finally {
    FeatureFlags.shutdown();
  }
});

test("fallback polling runs only while websocket is degraded", async () => {
  resetFakes();
  installWindowLike();

  const token = encodeJwt({ exp: nowInSeconds() });
  const fetchMock = createFetchMock({
    "GET /realtime/bootstrap": [
      {
        body: {
          token,
          flags: { "instant-transfers": true },
          revision: 1,
        },
      },
    ],
    "GET /flags": [
      { body: { flags: { "instant-transfers": true }, revision: 1 } },
      { body: { flags: { "instant-transfers": true }, revision: 1 } },
      { body: { flags: { "instant-transfers": true }, revision: 1 } },
      { body: { flags: { "instant-transfers": true }, revision: 1 } },
    ],
  });

  const sdkModule = await loadSdk();
  const { FeatureFlags } = sdkModule;

  try {
    await FeatureFlags.init({
      endpoint: "http://localhost:3001",
      mode: "bootstrap",
      fetchImpl: fetchMock,
      CentrifugeCtor: FakeCentrifuge,
      pollIntervalMs: 20,
    });

    const centrifuge = getLastCentrifuge();
    centrifuge.emit("disconnected", { reason: "network" });
    await sleep(70);

    const callsWhileDegraded = fetchMock.calls.filter((call) => call.key === "GET /flags").length;
    assert.ok(callsWhileDegraded >= 1);
    assert.equal(FeatureFlags.getConnectionState(), "degraded");

    centrifuge.emit("connected", {});
    await sleep(70);

    const callsAfterReconnect = fetchMock.calls.filter((call) => call.key === "GET /flags").length;
    assert.equal(callsAfterReconnect, callsWhileDegraded);
    assert.equal(FeatureFlags.getConnectionState(), "live");
  } finally {
    FeatureFlags.shutdown();
  }
});

test("init is idempotent for same config and does not create duplicate websocket clients", async () => {
  resetFakes();
  installWindowLike();

  const token = encodeJwt({ exp: nowInSeconds() });
  const fetchMock = createFetchMock({
    "GET /realtime/bootstrap": [
      {
        body: {
          token,
          flags: { "instant-transfers": true },
          revision: 1,
        },
      },
    ],
  });

  const sdkModule = await loadSdk();
  const { FeatureFlags } = sdkModule;

  try {
    await FeatureFlags.init({
      endpoint: "http://localhost:3001",
      mode: "bootstrap",
      fetchImpl: fetchMock,
      CentrifugeCtor: FakeCentrifuge,
      pollIntervalMs: 10000,
    });

    await FeatureFlags.init({
      endpoint: "http://localhost:3001",
      mode: "bootstrap",
      fetchImpl: fetchMock,
      CentrifugeCtor: FakeCentrifuge,
      pollIntervalMs: 10000,
    });

    assert.equal(FakeCentrifuge.instances.length, 1);
    assert.equal(fetchMock.calls.filter((call) => call.key === "GET /realtime/bootstrap").length, 1);
  } finally {
    FeatureFlags.shutdown();
  }
});

test("uses token-managed subscription without creating a duplicate", async () => {
  resetFakes();
  installWindowLike();

  const channel = "flags:acc:acc-local-ui:app:app-local-ui";
  const token = encodeJwt({ exp: nowInSeconds(), accountId: "acc-local-ui", appId: "app-local-ui", subs: { [channel]: {} } });
  const fetchMock = createFetchMock({
    "GET /realtime/bootstrap": [{ body: { token, flags: {}, revision: 1 } }],
  });
  const sdkModule = await loadSdk();
  const { FeatureFlags } = sdkModule;

  try {
    await FeatureFlags.init({ endpoint: "http://localhost:3001", fetchImpl: fetchMock, CentrifugeCtor: FakeCentrifuge });
    assert.equal(getLastCentrifuge().subscriptions.size, 0);
    assert.ok(getLastCentrifuge().tokenSubscriptions.has(channel));
  } finally {
    FeatureFlags.shutdown();
  }
});

test("does not create a fallback subscription for token-managed channels", async () => {
  resetFakes();
  installWindowLike();

  const token = encodeJwt({
    exp: nowInSeconds(),
    accountId: "acc-local-ui",
    appId: "app-local-ui",
    subs: { "flags:acc:acc-local-ui:app:app-local-ui": {} },
  });
  const fetchMock = createFetchMock({
    "GET /realtime/bootstrap": [{ body: { token, flags: {}, revision: 1 } }],
  });

  const { FeatureFlags } = await loadSdk();

  try {
    await FeatureFlags.init({
      endpoint: "http://localhost:3001",
      mode: "bootstrap",
      fetchImpl: fetchMock,
      CentrifugeCtor: FakeCentrifuge,
    });

    const centrifuge = getLastCentrifuge();
    assert.equal(centrifuge.subscriptions.has("flags:acc:acc-local-ui:app:app-local-ui"), false);
    assert.ok(centrifuge.tokenSubscriptions.has("flags:acc:acc-local-ui:app:app-local-ui"));
  } finally {
    FeatureFlags.shutdown();
  }
});

test("attaches to a token-managed subscription materialized during connection", async () => {
  resetFakes();
  installWindowLike();

  const channel = "flags:acc:acc-local-ui:app:app-local-ui";
  const token = encodeJwt({ exp: nowInSeconds(), accountId: "acc-local-ui", appId: "app-local-ui", subs: { [channel]: {} } });
  const fetchMock = createFetchMock({
    "GET /realtime/bootstrap": [{ body: { token, flags: { "job-explorer-apply-now": true }, revision: 1 } }],
  });

  class DelayedTokenSubscriptionCentrifuge extends FakeCentrifuge {
    connect() {
      this.emit("connecting", { reason: "initial" });
      setTimeout(() => {
        this.materializedTokenChannels.add(channel);
        this.emit("connected", {});
      }, 10);
    }
  }

  const { FeatureFlags } = await loadSdk();
  try {
    await FeatureFlags.init({
      endpoint: "http://localhost:3001",
      fetchImpl: fetchMock,
      CentrifugeCtor: DelayedTokenSubscriptionCentrifuge,
      tokenManagedSubscriptionRetryMs: 5,
      tokenManagedSafetyResyncMs: 0,
    });

    await sleep(30);
    const centrifuge = getLastCentrifuge();
    assert.equal(centrifuge.subscriptions.has(channel), false);
    assert.ok(centrifuge.tokenSubscriptions.has(channel));

    centrifuge.emitSubscriptionPublication(channel, {
      data: { revision: 2, changes: [{ flagKey: "job-explorer-apply-now", enabled: false, revision: 2 }] },
    });
    assert.equal(FeatureFlags.isEnabled("job-explorer-apply-now"), false);
  } finally {
    FeatureFlags.shutdown();
  }
});

test("triggers safety resync when token-managed subscription never materializes", async () => {
  resetFakes();
  installWindowLike();

  const channel = "flags:acc:acc-local-ui:app:app-local-ui";
  const token = encodeJwt({ exp: nowInSeconds(), accountId: "acc-local-ui", appId: "app-local-ui", subs: { [channel]: {} } });
  const fetchMock = createFetchMock({
    "GET /realtime/bootstrap": [{ body: { token, flags: { "job-explorer-apply-now": false }, revision: 1 } }],
    "GET /flags": [{ body: { flags: { "job-explorer-apply-now": true }, revision: 2 } }],
  });

  class NeverMaterializedTokenSubscriptionCentrifuge extends FakeCentrifuge {
    connect() {
      this.emit("connecting", { reason: "initial" });
      this.emit("connected", {});
    }
  }

  const { FeatureFlags } = await loadSdk();
  try {
    await FeatureFlags.init({
      endpoint: "http://localhost:3001",
      fetchImpl: fetchMock,
      CentrifugeCtor: NeverMaterializedTokenSubscriptionCentrifuge,
      tokenManagedSubscriptionRetryMs: 5,
      tokenManagedSafetyResyncMs: 20,
    });

    await sleep(220);
    assert.equal(FeatureFlags.isEnabled("job-explorer-apply-now"), true);
    assert.ok(fetchMock.calls.some((call) => call.key === "GET /flags"));
  } finally {
    FeatureFlags.shutdown();
  }
});

test("uses the scoped channel returned by bootstrap", async () => {
  resetFakes();
  installWindowLike();

  const channel = "flags:acc:acc-local-ui:app:app-local-ui";
  const token = encodeJwt({ exp: nowInSeconds() });
  const fetchMock = createFetchMock({
    "GET /realtime/bootstrap": [{
      body: {
        token,
        accountId: "acc-local-ui",
        appId: "app-local-ui",
        channel,
        flags: {},
        revision: 1,
      },
    }],
  });
  const { FeatureFlags } = await loadSdk();

  try {
    await FeatureFlags.init({ endpoint: "http://localhost:3001", fetchImpl: fetchMock, CentrifugeCtor: FakeCentrifuge });
    const centrifuge = getLastCentrifuge();
    assert.ok(centrifuge.subscriptions.has(channel));
    assert.equal(centrifuge.subscriptions.get(channel).subscribeCalls, 1);
  } finally {
    FeatureFlags.shutdown();
  }
});

test("normalizes ws base URL to secure websocket endpoint for non-local hosts", async () => {
  resetFakes();
  installWindowLike();

  const token = encodeJwt({ exp: nowInSeconds() });
  const fetchMock = createFetchMock({
    "GET /realtime/bootstrap": [
      {
        body: {
          token,
          flags: { "instant-transfers": true },
          revision: 1,
          centrifugoUrl: "ws://realtime.example.invalid/connection/websocket",
        },
      },
    ],
  });

  const sdkModule = await loadSdk();
  const { FeatureFlags } = sdkModule;

  try {
    await FeatureFlags.init({
      endpoint: "http://localhost:3001",
      mode: "bootstrap",
      fetchImpl: fetchMock,
      CentrifugeCtor: FakeCentrifuge,
      pollIntervalMs: 10000,
    });

    const centrifuge = getLastCentrifuge();
    assert.equal(
      centrifuge.endpoint,
      "wss://realtime.example.invalid/connection/websocket"
    );
  } finally {
    FeatureFlags.shutdown();
  }
});
