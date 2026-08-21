import assert from "node:assert/strict";

const openfeature = await import("feature-flag-management-application-sdk/openfeature");
const reactWrapper = await import("feature-flag-management-application-sdk/react");

assert.equal(typeof openfeature.FeatureFlagsOpenFeatureProvider, "function");
assert.equal(typeof reactWrapper.FeatureFlagsProvider, "function");

console.log("Validated package imports: openfeature + react");
