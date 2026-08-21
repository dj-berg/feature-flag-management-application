import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");

const sourcePath = path.join(distDir, "FeatureFlags.js");
const umdPath = path.join(distDir, "feature-flags.umd.js");
const esmIndexPath = path.join(distDir, "index.js");
const dtsIndexPath = path.join(distDir, "index.d.ts");
const reactProviderPath = path.join(distDir, "react", "FeatureFlagsProvider.js");
const reactContextPath = path.join(distDir, "react", "FeatureFlagsContext.js");
const reactHookPath = path.join(distDir, "react", "useFeatureFlags.js");

const source = await readFile(sourcePath, "utf8");
const esmIndexSource = await readFile(esmIndexPath, "utf8");
const dtsIndexSource = await readFile(dtsIndexPath, "utf8");
const reactProviderSource = await readFile(reactProviderPath, "utf8");
const reactContextSource = await readFile(reactContextPath, "utf8");
const reactHookSource = await readFile(reactHookPath, "utf8");

const withoutExports = source
  .replace(/^export\s+\{[^}]+\};?\s*$/gm, "")
  .replace(/^export\s+/gm, "");

const wrapped = `(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ConsumerSdk = Object.assign({}, root.ConsumerSdk || {}, factory());
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
${withoutExports}

  return {
    FeatureFlags,
    init,
    isEnabled,
    subscribe,
    getFlags,
    getConnectionState,
    shutdown,
  };
});
`;

await writeFile(umdPath, wrapped, "utf8");

const reactUmdPath = path.join(distDir, "react", "index.umd.js");
const reactSources = [source, reactContextSource, reactProviderSource, reactHookSource]
  .join("\n")
  .replace(/^import[^;]+;\s*/gm, "")
  .replace(/^export\s+/gm, "")
  .replace(/ from \"\.\/[^\"]+\";?/g, ";")
  .replace(/ from '\.\/[^']+';?/g, ";")
  .replace(/ from \"\.\.\/FeatureFlags\.js\";?/g, ";");

await writeFile(
  reactUmdPath,
  `(function (root) {\n  const React = root.React;\n  if (!React) throw new Error("React must be loaded before consumer-sdk/react");\n  const { createContext, useContext, useEffect, useMemo, useState } = React;\n${reactSources}\n  root.ConsumerSdk = Object.assign({}, root.ConsumerSdk || {}, {\n    React: { FeatureFlagsProvider, useFeatureFlags, FeatureFlagsContext }\n  });\n})(typeof globalThis !== "undefined" ? globalThis : window);\n`,
  "utf8"
);
await writeFile(
  esmIndexPath,
  esmIndexSource
    .replace("\"./FeatureFlags\"", "\"./FeatureFlags.js\"")
    .replace("'./FeatureFlags'", "'./FeatureFlags.js'"),
  "utf8"
);
await writeFile(
  dtsIndexPath,
  dtsIndexSource
    .replace("\"./FeatureFlags\"", "\"./FeatureFlags.js\"")
    .replace("'./FeatureFlags'", "'./FeatureFlags.js'"),
  "utf8"
);
