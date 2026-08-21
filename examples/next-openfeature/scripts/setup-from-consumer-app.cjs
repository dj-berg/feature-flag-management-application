const fs = require("fs");
const path = require("path");

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

const projectRoot = path.resolve(__dirname, "..", "..", "..");
const sourceEnvPath = path.join(projectRoot, "consumer-app", ".env");
const targetEnvPath = path.join(projectRoot, "examples", "next-openfeature", ".env.local");

if (!fs.existsSync(sourceEnvPath)) {
  console.error("[setup] consumer-app/.env not found");
  process.exit(1);
}

const source = parseEnv(fs.readFileSync(sourceEnvPath, "utf8"));

const lines = [
  "NEXT_PUBLIC_FF_BOOTSTRAP_STRATEGY=server",
  "NEXT_PUBLIC_FF_CLIENT_ID=server-bootstrap-client",
  `FEATURE_FLAGS_API_URL=${source.FEATURE_FLAGS_API_URL || ""}`,
  `FF_CLIENT_ID=${source.CONSUMER_CLIENT_ID || source.CLIENT_ID || ""}`,
  `FF_CLIENT_SECRET=${source.CONSUMER_CLIENT_SECRET || source.CLIENT_SECRET || ""}`,
  `STABLE_CENTRIFUGO_URL=${source.STABLE_CENTRIFUGO_URL || "https://realtime.example.invalid"}`,
  `CENTRIFUGO_URL=${source.CENTRIFUGO_URL || ""}`,
  "",
].join("\n");

fs.writeFileSync(targetEnvPath, lines, "utf8");

const missing = [];
if (!source.FEATURE_FLAGS_API_URL) missing.push("FEATURE_FLAGS_API_URL");
if (!(source.CONSUMER_CLIENT_ID || source.CLIENT_ID)) missing.push("CONSUMER_CLIENT_ID/CLIENT_ID");
if (!(source.CONSUMER_CLIENT_SECRET || source.CLIENT_SECRET)) missing.push("CONSUMER_CLIENT_SECRET/CLIENT_SECRET");

if (missing.length) {
  console.warn("[setup] Wrote examples/next-openfeature/.env.local but some values are empty:");
  missing.forEach((name) => console.warn(`- ${name}`));
  process.exit(0);
}

console.log("[setup] examples/next-openfeature/.env.local populated from consumer-app/.env");
