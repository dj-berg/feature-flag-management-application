import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const packages = [
  "consumer-sdk",
  "consumer-app",
  "local-app",
  "test-consumer",
  "examples/next-openfeature",
  "functions/api/consumerAuth",
  "functions/api/createFlag",
  "functions/api/deleteFlag",
  "functions/api/listFlags",
  "functions/gateway-authorizer",
  "functions/stream-publisher",
];

for (const directory of packages) {
  const packageDirectory = join(process.cwd(), directory);
  if (!existsSync(join(packageDirectory, "package-lock.json"))) {
    throw new Error(`${directory} is missing package-lock.json`);
  }

  console.log(`Installing ${directory}`);
  const result = spawnSync("npm", ["ci", "--prefix", directory], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\nDependencies installed.");
console.log("Next steps:");
console.log("  1. Copy the relevant .env.example to .env and set local values.");
console.log("  2. Run npm run check for credential-free validation.");
console.log("  3. Run npm run dev:local or npm run dev:consumer.");
