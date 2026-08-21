require("dotenv").config();

const path = require("path");
const express = require("express");
const { createConsumerAuthClient } = require("../shared/consumer-auth-client");
const { resolveRuntimeCentrifugoUrl } = require("../shared/centrifugo-url");

const app = express();
app.disable("x-powered-by");

const PORT = process.env.PORT || 3003;
const config = {
  featureFlagsApiUrl: String(process.env.FEATURE_FLAGS_API_URL || "").trim().replace(/\/$/, ""),
  clientId: String(process.env.CLIENT_ID || process.env.CONSUMER_CLIENT_ID || "").trim(),
  clientSecret: String(process.env.CLIENT_SECRET || process.env.CONSUMER_CLIENT_SECRET || "").trim(),
  centrifugoUrl: resolveRuntimeCentrifugoUrl({
    stableUrl: process.env.STABLE_CENTRIFUGO_URL,
    fallbackUrl: process.env.CENTRIFUGO_URL,
    appName: "test-consumer",
  }),
};

const authClient = createConsumerAuthClient({
  consumerAuthUrl: `${config.featureFlagsApiUrl}/consumer/auth`,
  featureFlagsApiUrl: config.featureFlagsApiUrl,
  clientId: config.clientId,
  clientSecret: config.clientSecret,
});

const missingRequiredValues = [];
if (!config.featureFlagsApiUrl) missingRequiredValues.push("FEATURE_FLAGS_API_URL");
if (!config.clientId) missingRequiredValues.push("CLIENT_ID (or CONSUMER_CLIENT_ID)");
if (!config.clientSecret) missingRequiredValues.push("CLIENT_SECRET (or CONSUMER_CLIENT_SECRET)");

if (missingRequiredValues.length) {
  console.error("\n[test-consumer] Missing required environment values:\n");
  missingRequiredValues.forEach((name) => {
    console.error(`- ${name}`);
  });
  console.error("\nFix one of these ways:");
  console.error("1) Run: npm run setup:from-consumer-app");
  console.error("2) Manually edit test-consumer/.env\n");
  process.exit(1);
}

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

app.get("/consumer-sdk.js", (req, res) => {
  res.type("application/javascript");
  res.sendFile(path.join(__dirname, "..", "consumer-sdk", "dist", "feature-flags.umd.js"));
});

app.get("/runtime-config.js", (req, res) => {
  res.type("application/javascript");
  res.send(
    `window.__APP_CONFIG__ = ${JSON.stringify({
      centrifugoUrl: config.centrifugoUrl,
    })};`
  );
});

app.get("/flags", async (req, res) => {
  try {
    const snapshot = await authClient.fetchFlags();
    res.json(snapshot);
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load flags" });
  }
});

app.get("/realtime/bootstrap", async (req, res) => {
  try {
    const session = await authClient.authenticate();
    const snapshot = await authClient.fetchFlags();

    res.json({
      token: session.accessToken,
      flags: snapshot.flags,
      descriptions: snapshot.descriptions,
      revision: snapshot.revision,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to create session" });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const server = app.listen(PORT, () => {
  console.log(`Test consumer running at http://localhost:${PORT}`);
});
