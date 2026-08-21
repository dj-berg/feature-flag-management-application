import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import path from "node:path";

const sdkRoot = path.resolve(new URL("..", import.meta.url).pathname);
const execFileAsync = promisify(execFile);

test("package exports map to built dist artifacts", async () => {
  const packageJsonPath = path.join(sdkRoot, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

  assert.equal(packageJson.name, "feature-flag-management-application-sdk");
  assert.ok(packageJson.exports);
  assert.ok(packageJson.exports["."]);
  assert.ok(packageJson.exports["./openfeature"]);
  assert.ok(packageJson.exports["./react"]);

  const exportTargets = [
    packageJson.main,
    packageJson.types,
    packageJson.exports["."].default,
    packageJson.exports["."].types,
    packageJson.exports["./openfeature"].default,
    packageJson.exports["./openfeature"].types,
    packageJson.exports["./react"].default,
    packageJson.exports["./react"].types,
  ];

  for (const relativePath of exportTargets) {
    const absolutePath = path.join(sdkRoot, relativePath);
    await access(absolutePath);
  }
});

test("built subpath entrypoints are importable", async () => {
  const openfeatureEntrypoint = await import("../dist/openfeature/index.js");
  const reactEntrypoint = await import("../dist/react/index.js");

  assert.equal(typeof openfeatureEntrypoint.FeatureFlagsOpenFeatureProvider, "function");
  assert.equal(typeof reactEntrypoint.FeatureFlagsProvider, "function");
});

test("npm pack dry run includes openfeature and react dist artifacts", async () => {
  const { stdout } = await execFileAsync("npm", ["pack", "--dry-run", "--json"], {
    cwd: sdkRoot,
  });
  const packSummary = JSON.parse(stdout);
  const packedFiles = new Set((packSummary[0]?.files ?? []).map((entry) => entry.path));

  assert.ok(packedFiles.has("dist/openfeature/index.js"));
  assert.ok(packedFiles.has("dist/openfeature/index.d.ts"));
  assert.ok(packedFiles.has("dist/react/index.js"));
  assert.ok(packedFiles.has("dist/react/index.d.ts"));
});
