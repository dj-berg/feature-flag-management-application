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
      acc[line.slice(0, index).trim()] = line.slice(index + 1).trim();
      return acc;
    }, {});
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message || body?.error || `${options.method || "GET"} ${url} failed (${response.status})`);
  }
  return body || {};
}

async function main() {
  const value = process.argv[2];
  if (value !== "true" && value !== "false") {
    throw new Error("Usage: node scripts/set-flag.cjs <true|false>");
  }

  const enabled = value === "true";
  const projectRoot = path.resolve(__dirname, "..", "..", "..");
  const envPath = path.join(projectRoot, "examples", "next-openfeature", ".env.local");
  const env = parseEnv(fs.readFileSync(envPath, "utf8"));

  const apiBase = String(env.FEATURE_FLAGS_API_URL || "").replace(/\/$/, "");
  const clientId = String(env.FF_CLIENT_ID || "").trim();
  const clientSecret = String(env.FF_CLIENT_SECRET || "").trim();

  const auth = await requestJson(`${apiBase}/consumer/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });

  await requestJson(`${apiBase}/flags`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.accessToken}`,
    },
    body: JSON.stringify({ flagKey: "some-flag", enabled, description: "acceptance flag" }),
  });

  console.log(`some-flag set to ${enabled}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
