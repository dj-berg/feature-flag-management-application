const fs = require("fs");
const path = require("path");
const { resolveRuntimeCentrifugoUrl } = require("../../shared/centrifugo-url");

function parseEnv(raw) {
  return String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .reduce((acc, line) => {
      const index = line.indexOf("=");
      if (index <= 0) {
        return acc;
      }

      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();
      acc[key] = value;
      return acc;
    }, {});
}

const projectRoot = path.resolve(__dirname, "..", "..");
const sourceEnvPath = path.join(projectRoot, "consumer-app", ".env");
const targetEnvPath = path.join(projectRoot, "test-consumer", ".env");

if (!fs.existsSync(sourceEnvPath)) {
  console.error("[setup] consumer-app/.env was not found.");
  process.exit(1);
}

const source = parseEnv(fs.readFileSync(sourceEnvPath, "utf8"));
const stableCentrifugoUrl = resolveRuntimeCentrifugoUrl({
  stableUrl: source.STABLE_CENTRIFUGO_URL,
  fallbackUrl: source.CENTRIFUGO_URL,
  appName: "test-consumer setup",
});

const output = [
  "PORT=3003",
  `FEATURE_FLAGS_API_URL=${source.FEATURE_FLAGS_API_URL || ""}`,
  `CLIENT_ID=${source.CONSUMER_CLIENT_ID || source.CLIENT_ID || ""}`,
  `CLIENT_SECRET=${source.CONSUMER_CLIENT_SECRET || source.CLIENT_SECRET || ""}`,
  `STABLE_CENTRIFUGO_URL=${stableCentrifugoUrl}`,
  `CENTRIFUGO_WS_ORIGIN=http://localhost:${source.PORT || "3003"}`,
  "",
].join("\n");

fs.writeFileSync(targetEnvPath, output, "utf8");

const missing = [];
if (!source.FEATURE_FLAGS_API_URL) missing.push("FEATURE_FLAGS_API_URL");
if (!(source.CONSUMER_CLIENT_ID || source.CLIENT_ID)) missing.push("CONSUMER_CLIENT_ID/CLIENT_ID");
if (!(source.CONSUMER_CLIENT_SECRET || source.CLIENT_SECRET)) missing.push("CONSUMER_CLIENT_SECRET/CLIENT_SECRET");

if (missing.length) {
  console.warn("[setup] Wrote test-consumer/.env but some values are still empty:");
  missing.forEach((key) => console.warn(`- ${key}`));
  process.exit(0);
}

console.log("[setup] test-consumer/.env populated from consumer-app/.env");
