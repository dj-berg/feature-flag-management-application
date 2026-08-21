require("dotenv").config();

const path = require("path");
const express = require("express");
const { createConsumerAuthClient } = require("../shared/consumer-auth-client");
const { resolveRuntimeCentrifugoUrl } = require("../shared/centrifugo-url");

const app = express();
app.disable("x-powered-by");

const PORT = process.env.PORT || 3002;
const CENTRIFUGO_URL = resolveRuntimeCentrifugoUrl({
  stableUrl: process.env.STABLE_CENTRIFUGO_URL,
  fallbackUrl: process.env.CENTRIFUGO_URL,
  appName: "consumer-app",
});
const FEATURE_FLAGS_API_URL = process.env.FEATURE_FLAGS_API_URL;
const CONSUMER_AUTH_URL =
  process.env.CONSUMER_AUTH_URL ||
  (FEATURE_FLAGS_API_URL
    ? `${FEATURE_FLAGS_API_URL.replace(/\/$/, "")}/consumer/auth`
    : "");
const CONSUMER_CLIENT_ID = process.env.CONSUMER_CLIENT_ID;
const CONSUMER_CLIENT_SECRET = process.env.CONSUMER_CLIENT_SECRET;

const authClient = createConsumerAuthClient({
  consumerAuthUrl: CONSUMER_AUTH_URL,
  featureFlagsApiUrl: FEATURE_FLAGS_API_URL,
  clientId: CONSUMER_CLIENT_ID,
  clientSecret: CONSUMER_CLIENT_SECRET,
});

app.use(express.static(path.join(__dirname, "public")));
app.get("/consumer-sdk.js", (req, res) => {
  res.type("application/javascript");
  res.sendFile(path.join(__dirname, "..", "consumer-sdk", "dist", "feature-flags.umd.js"));
});
app.get("/consumer-sdk-react.js", (req, res) => {
  res.type("application/javascript");
  res.sendFile(path.join(__dirname, "..", "consumer-sdk", "dist", "react", "index.umd.js"));
});
app.use(express.json());

app.get("/runtime-config.js", (req, res) => {
  res.type("application/javascript");
  res.send(
    `window.__APP_CONFIG__ = ${JSON.stringify({
      centrifugoUrl: CENTRIFUGO_URL || "",
      clientId: CONSUMER_CLIENT_ID || "",
      clientSecret: CONSUMER_CLIENT_SECRET || "",
      featureFlagsApiUrl: FEATURE_FLAGS_API_URL || "",
      accountId: process.env.ACCOUNT_ID || "",
      appId: process.env.APP_ID || "",
    })};`
  );
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function fetchFlagsFromApi() {
  return authClient.fetchFlags();
}

async function upsertFlagViaApi(flagKey, enabled) {
  const body = await authClient.upsertFlag({ flagKey, enabled });
  return {
    message: body?.message || "Feature flag saved successfully.",
    item: body?.item || null,
  };
}

async function deleteFlagViaApi(flagKey) {
  const body = await authClient.deleteFlag({ flagKey });
  return {
    message: body?.message || "Feature flag deleted successfully.",
  };
}

app.get("/flags", async (req, res) => {
  try {
    const snapshot = await fetchFlagsFromApi();
    res.json(snapshot);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load flags" });
  }
});

app.post("/flags/:flagKey/toggle", async (req, res) => {
  try {
    const flagKey = (req.params.flagKey || "").trim();
    const { enabled } = req.body || {};

    if (!flagKey || typeof enabled !== "boolean") {
      return res.status(400).json({
        error: "flagKey is required and enabled must be a boolean",
      });
    }

    const result = await upsertFlagViaApi(flagKey, enabled);
    return res.json({
      ...result,
      savedVia: "api",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update feature flag" });
  }
});

app.delete("/flags/:flagKey", async (req, res) => {
  try {
    const flagKey = (req.params.flagKey || "").trim();
    if (!flagKey) {
      return res.status(400).json({ error: "flagKey is required" });
    }

    const result = await deleteFlagViaApi(flagKey);
    return res.json({
      ...result,
      deletedVia: "api",
      flagKey,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to delete feature flag" });
  }
});

app.get("/realtime/bootstrap", async (req, res) => {
  try {
    const session = await authClient.authenticate();
    const { accessToken } = session;

    const snapshot = await fetchFlagsFromApi();

    res.json({
      token: accessToken,
      flags: snapshot.flags,
      descriptions: snapshot.descriptions,
      revision: snapshot.revision,
      accountId: snapshot.accountId,
      appId: snapshot.appId,
      channel: `flags:acc:${snapshot.accountId}:app:${snapshot.appId}`,
      centrifugoUrl: CENTRIFUGO_URL,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to create session",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Consumer app running at http://localhost:${PORT}`);
});
