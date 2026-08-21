require("dotenv").config();

const required = {
  FEATURE_FLAGS_API_URL: String(process.env.FEATURE_FLAGS_API_URL || "").trim(),
  CLIENT_ID: String(process.env.CLIENT_ID || process.env.CONSUMER_CLIENT_ID || "").trim(),
  CLIENT_SECRET: String(process.env.CLIENT_SECRET || process.env.CONSUMER_CLIENT_SECRET || "").trim(),
};

const missing = Object.entries(required)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length) {
  console.error("[validate] Missing required values:");
  missing.forEach((key) => console.error(`- ${key}`));
  process.exit(1);
}

console.log("[validate] Required config values are present.");
