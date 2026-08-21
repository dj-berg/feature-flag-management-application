import { readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';

const roots = ['functions', 'local-app', 'consumer-app', 'test-consumer', 'shared'];
const ignored = new Set(['node_modules', 'dist', 'build']);

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else if (['.js', '.mjs', '.cjs'].includes(extname(entry.name))) files.push(path);
  }
  return files;
}

for (const root of roots) {
  for (const file of await filesUnder(root)) {
    execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  }
}
