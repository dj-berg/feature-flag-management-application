import { spawnSync } from 'node:child_process';

const packages = ['consumer-sdk', 'consumer-app', 'examples/next-openfeature'];

for (const directory of packages) {
  console.log(`Auditing ${directory}`);
  const result = spawnSync('npm', ['audit', '--audit-level=high', '--package-lock-only'], {
    cwd: directory,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
