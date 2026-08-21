import { transformFileAsync } from "@babel/core";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const source = resolve("public/app.jsx");
const output = resolve("public/app.js");
const result = await transformFileAsync(source, {
  presets: [["@babel/preset-react", { runtime: "classic" }]],
  sourceType: "script",
});

if (!result?.code) {
  throw new Error("Failed to compile local app JSX.");
}

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${result.code}\n`, "utf8");
