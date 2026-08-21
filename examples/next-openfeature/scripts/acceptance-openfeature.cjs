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

function decodeJwtPayload(token) {
  const parts = String(token || "").split(".");
  if (parts.length < 2) return null;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

async function main() {
  const projectRoot = path.resolve(__dirname, "..", "..", "..");
  const envPath = path.join(projectRoot, "examples", "next-openfeature", ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error("Missing examples/next-openfeature/.env.local. Run npm run setup:from-consumer-app first.");
  }

  const env = parseEnv(fs.readFileSync(envPath, "utf8"));
  const featureFlagsApiUrl = String(env.FEATURE_FLAGS_API_URL || "").replace(/\/$/, "");
  const clientId = String(env.FF_CLIENT_ID || "").trim();
  const clientSecret = String(env.FF_CLIENT_SECRET || "").trim();
  const appOrigin = String(process.env.NEXT_APP_ORIGIN || "http://localhost:3000").replace(/\/$/, "");

  if (!featureFlagsApiUrl || !clientId || !clientSecret) {
    throw new Error("FEATURE_FLAGS_API_URL, FF_CLIENT_ID, and FF_CLIENT_SECRET are required in .env.local");
  }

  const auth = await requestJson(`${featureFlagsApiUrl}/consumer/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });

  const accessToken = String(auth.accessToken || "").trim();
  if (!accessToken) {
    throw new Error("Auth response missing accessToken");
  }

  const bootstrap = await requestJson(`${appOrigin}/realtime/bootstrap`);
  const bootstrapToken = String(bootstrap.token || "").trim();
  if (!bootstrapToken) {
    throw new Error("Bootstrap response missing token");
  }

  const claims = decodeJwtPayload(bootstrapToken) || {};
  const hasClientSecretInBootstrap = JSON.stringify(bootstrap).includes(clientSecret);
  if (hasClientSecretInBootstrap) {
    throw new Error("Bootstrap payload leaked client secret");
  }

  const upsert = async (enabled) =>
    requestJson(`${featureFlagsApiUrl}/flags`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ flagKey: "some-flag", enabled, description: "acceptance flag" }),
    });

  await upsert(false);
  const snapshotFalse = await requestJson(`${featureFlagsApiUrl}/flags`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  await upsert(true);
  const snapshotTrue = await requestJson(`${featureFlagsApiUrl}/flags`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const result = {
    appOrigin,
    bootstrapRoute: `${appOrigin}/realtime/bootstrap`,
    bootstrapTokenIssued: Boolean(bootstrapToken),
    bootstrapHasChannel: Boolean(bootstrap.channel),
    bootstrapHasCentrifugoUrl: Boolean(bootstrap.centrifugoUrl),
    browserSecretExposed: false,
    tokenClaims: {
      accountId: claims.accountId || null,
      appId: claims.appId || null,
      subs: claims.subs ? Object.keys(claims.subs) : [],
    },
    flags: {
      afterFalse: snapshotFalse.flags?.["some-flag"],
      afterTrue: snapshotTrue.flags?.["some-flag"],
    },
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
