import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

test("consumer app loads the built SDK React provider artifact", async () => {
  const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
  const htmlPath = path.join(repoRoot, "consumer-app", "public", "index.html");
  const appPath = path.join(repoRoot, "consumer-app", "public", "app.jsx");
  const sdkBundlePath = path.join(repoRoot, "consumer-sdk", "dist", "feature-flags.umd.js");
  const reactBundlePath = path.join(repoRoot, "consumer-sdk", "dist", "react", "index.umd.js");

  const [html, appJsx, sdkBundle, reactBundle] = await Promise.all([
    readFile(htmlPath, "utf8"),
    readFile(appPath, "utf8"),
    readFile(sdkBundlePath, "utf8"),
    readFile(reactBundlePath, "utf8"),
  ]);

  assert.match(html, /<script src="\/consumer-sdk\.js"><\/script>/);
  assert.match(html, /<script src="\/consumer-sdk-react\.js"><\/script>/);
  assert.match(appJsx, /window\.ConsumerSdk\.React/);
  assert.match(appJsx, /FeatureFlagsProvider/);
  assert.match(appJsx, /useFeatureFlags/);
  assert.match(appJsx, /clientId=\{config\.clientId\}/);
  assert.match(appJsx, /clientSecret=\{config\.clientSecret\}/);
  assert.match(sdkBundle, /FeatureFlags/);
  assert.match(sdkBundle, /ConsumerSdk/);
  assert.match(reactBundle, /FeatureFlagsProvider/);
  assert.match(reactBundle, /useFeatureFlags/);
});
