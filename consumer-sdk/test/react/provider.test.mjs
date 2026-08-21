import test from "node:test";
import assert from "node:assert/strict";

test("react entrypoint exports the provider adapter", async () => {
  const react = await import("../../dist/react/index.js");

  assert.equal(typeof react.FeatureFlagsProvider, "function");
  assert.equal(typeof react.useFeatureFlags, "function");
  assert.ok(react.FeatureFlagsContext);
});
