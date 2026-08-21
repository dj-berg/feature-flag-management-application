import test from "node:test";
import assert from "node:assert/strict";
import {
  OpenFeature,
  ProviderEvents,
} from "@openfeature/web-sdk";
import {
  createFetchMock,
  encodeJwt,
  FakeCentrifuge,
  getLastCentrifuge,
  installWindowLike,
  resetFakes,
  sleep,
} from "../helpers.mjs";

function nowInSeconds(offset = 600) {
  return Math.floor(Date.now() / 1000) + offset;
}

async function loadProvider() {
  return import("../../dist/openfeature/index.js");
}

test("direct strategy rejects missing clientSecret", async () => {
  resetFakes();
  installWindowLike();

  const { FeatureFlagsOpenFeatureProvider } = await loadProvider();
  const provider = new FeatureFlagsOpenFeatureProvider({
    clientId: "client",
  });

  await assert.rejects(
    async () => OpenFeature.setProviderAndWait(provider),
    /requires clientId and clientSecret for direct bootstrap/
  );

  await OpenFeature.clearProviders();
});

test("OpenFeature provider initializes with clientId/clientSecret and resolves boolean values", async () => {
  resetFakes();
  installWindowLike();

  const token = encodeJwt({
    exp: nowInSeconds(),
    accountId: "acc-local-ui",
    appId: "app-local-ui",
    subs: { "flags:acc:acc-local-ui:app:app-local-ui": {} },
  });
  const fetchMock = createFetchMock({
    "POST /dev/consumer/bootstrap": [{
      body: {
        token,
        flags: { "instant-transfers": true, "new-dashboard": false },
        revision: 1,
        channel: "flags:acc:acc-local-ui:app:app-local-ui",
      },
    }],
  });

  const { FeatureFlagsOpenFeatureProvider } = await loadProvider();
  const provider = new FeatureFlagsOpenFeatureProvider({
    clientId: "client",
    clientSecret: "secret",
    fetchImpl: fetchMock,
    CentrifugeCtor: FakeCentrifuge,
  });

  const readyEvents = [];

  try {
    await OpenFeature.clearProviders();
    OpenFeature.addHandler(ProviderEvents.Ready, (details) => {
      readyEvents.push(details);
    });
    await OpenFeature.setProviderAndWait(provider);
    const client = OpenFeature.getClient();

    assert.equal(client.getBooleanValue("instant-transfers", false), true);
    assert.equal(client.getBooleanValue("new-dashboard", true), false);
    assert.equal(client.getBooleanValue("missing-flag", false), false);
    assert.ok(readyEvents.length >= 1);
  } finally {
    await OpenFeature.clearProviders();
  }
});

test("OpenFeature provider supports server bootstrap strategy without browser clientSecret", async () => {
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
        flags: { "some-flag": true },
        revision: 2,
        channel: "flags:acc:acc-local-ui:app:app-local-ui",
      },
    }],
  });

  const { FeatureFlagsOpenFeatureProvider } = await loadProvider();
  const provider = new FeatureFlagsOpenFeatureProvider({
    bootstrapStrategy: "server",
    clientId: "client",
    fetchImpl: fetchMock,
    CentrifugeCtor: FakeCentrifuge,
  });

  try {
    await OpenFeature.clearProviders();
    await OpenFeature.setProviderAndWait(provider);
    const client = OpenFeature.getClient();

    assert.equal(client.getBooleanValue("some-flag", false), true);
    const callKeys = fetchMock.calls.map((call) => call.key);
    assert.ok(callKeys.includes("GET /realtime/bootstrap"));
    assert.equal(callKeys.includes("POST /dev/consumer/bootstrap"), false);
    assert.equal(callKeys.includes("POST /consumer/auth"), false);
  } finally {
    await OpenFeature.clearProviders();
  }
});

test("OpenFeature provider emits configuration changed when realtime updates arrive", async () => {
  resetFakes();
  installWindowLike();

  const token = encodeJwt({
    exp: nowInSeconds(),
    accountId: "acc-local-ui",
    appId: "app-local-ui",
    subs: { "flags:acc:acc-local-ui:app:app-local-ui": {} },
  });
  const fetchMock = createFetchMock({
    "POST /dev/consumer/bootstrap": [{
      body: {
        token,
        flags: { "instant-transfers": true },
        revision: 1,
        channel: "flags:acc:acc-local-ui:app:app-local-ui",
      },
    }],
  });

  const { FeatureFlagsOpenFeatureProvider } = await loadProvider();
  const provider = new FeatureFlagsOpenFeatureProvider({
    clientId: "client",
    clientSecret: "secret",
    fetchImpl: fetchMock,
    CentrifugeCtor: FakeCentrifuge,
  });

  const events = [];

  try {
    await OpenFeature.clearProviders();
    OpenFeature.addHandler(ProviderEvents.ConfigurationChanged, (details) => {
      events.push(details);
    });
    await OpenFeature.setProviderAndWait(provider);

    const centrifuge = getLastCentrifuge();
    centrifuge.emitSubscriptionPublication("flags:acc:acc-local-ui:app:app-local-ui", {
      data: {
        revision: 2,
        changes: [{ flagKey: "instant-transfers", enabled: false, revision: 2 }],
      },
    });

    await sleep(0);
    const client = OpenFeature.getClient();
    assert.equal(client.getBooleanValue("instant-transfers", true), false);
    assert.ok(events.length >= 1);
  } finally {
    await OpenFeature.clearProviders();
  }
});

test("OpenFeature provider resolves string, number, and object flags", async () => {
  resetFakes();
  installWindowLike();

  const token = encodeJwt({
    exp: nowInSeconds(),
    accountId: "acc-local-ui",
    appId: "app-local-ui",
    subs: { "flags:acc:acc-local-ui:app:app-local-ui": {} },
  });
  const fetchMock = createFetchMock({
    "POST /dev/consumer/bootstrap": [{
      body: {
        token,
        flags: {
          "theme-name": "summer",
          "checkout-version": 2,
          "search-config": { mode: "hybrid", weights: [0.7, 0.3] },
        },
        revision: 1,
        channel: "flags:acc:acc-local-ui:app:app-local-ui",
      },
    }],
  });

  const { FeatureFlagsOpenFeatureProvider } = await loadProvider();
  const provider = new FeatureFlagsOpenFeatureProvider({
    clientId: "client",
    clientSecret: "secret",
    fetchImpl: fetchMock,
    CentrifugeCtor: FakeCentrifuge,
  });

  try {
    await OpenFeature.clearProviders();
    await OpenFeature.setProviderAndWait(provider);
    const client = OpenFeature.getClient();

    assert.equal(client.getStringValue("theme-name", "default"), "summer");
    assert.equal(client.getNumberValue("checkout-version", 0), 2);
    assert.deepEqual(
      client.getObjectValue("search-config", { mode: "keyword", weights: [1, 0] }),
      { mode: "hybrid", weights: [0.7, 0.3] },
    );
  } finally {
    await OpenFeature.clearProviders();
  }
});

test("OpenFeature provider emits stale during reconnect/degraded transitions", async () => {
  resetFakes();
  installWindowLike();

  const token = encodeJwt({
    exp: nowInSeconds(),
    accountId: "acc-local-ui",
    appId: "app-local-ui",
    subs: { "flags:acc:acc-local-ui:app:app-local-ui": {} },
  });
  const fetchMock = createFetchMock({
    "POST /dev/consumer/bootstrap": [{
      body: {
        token,
        flags: { "instant-transfers": true },
        revision: 1,
        channel: "flags:acc:acc-local-ui:app:app-local-ui",
      },
    }],
  });

  const { FeatureFlagsOpenFeatureProvider } = await loadProvider();
  const provider = new FeatureFlagsOpenFeatureProvider({
    clientId: "client",
    clientSecret: "secret",
    fetchImpl: fetchMock,
    CentrifugeCtor: FakeCentrifuge,
  });

  const staleEvents = [];

  try {
    await OpenFeature.clearProviders();
    OpenFeature.addHandler(ProviderEvents.Stale, (details) => {
      staleEvents.push(details);
    });

    await OpenFeature.setProviderAndWait(provider);

    const centrifuge = getLastCentrifuge();
    centrifuge.emit("connecting", { reason: "network" });
    await sleep(0);
    centrifuge.emit("disconnected", { reason: "network" });
    await sleep(0);

    assert.ok(staleEvents.length >= 1);
  } finally {
    await OpenFeature.clearProviders();
  }
});

test("OpenFeature provider emits ready again after stale recovery", async () => {
  resetFakes();
  installWindowLike();

  const token = encodeJwt({
    exp: nowInSeconds(),
    accountId: "acc-local-ui",
    appId: "app-local-ui",
    subs: { "flags:acc:acc-local-ui:app:app-local-ui": {} },
  });
  const fetchMock = createFetchMock({
    "POST /dev/consumer/bootstrap": [{
      body: {
        token,
        flags: { "instant-transfers": true },
        revision: 1,
        channel: "flags:acc:acc-local-ui:app:app-local-ui",
      },
    }],
  });

  const { FeatureFlagsOpenFeatureProvider } = await loadProvider();
  const provider = new FeatureFlagsOpenFeatureProvider({
    clientId: "client",
    clientSecret: "secret",
    fetchImpl: fetchMock,
    CentrifugeCtor: FakeCentrifuge,
  });

  const readyEvents = [];
  const staleEvents = [];

  try {
    await OpenFeature.clearProviders();
    OpenFeature.addHandler(ProviderEvents.Ready, (details) => {
      readyEvents.push(details);
    });
    OpenFeature.addHandler(ProviderEvents.Stale, (details) => {
      staleEvents.push(details);
    });

    await OpenFeature.setProviderAndWait(provider);

    const centrifuge = getLastCentrifuge();
    centrifuge.emit("disconnected", { reason: "network" });
    await sleep(0);
    centrifuge.emit("connected", {});
    await sleep(0);

    assert.ok(staleEvents.length >= 1);
    assert.ok(readyEvents.length >= 2);
  } finally {
    await OpenFeature.clearProviders();
  }
});
