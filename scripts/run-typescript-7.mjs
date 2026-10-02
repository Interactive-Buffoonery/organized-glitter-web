import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const packageDirectory = path.dirname(require.resolve('@typescript/native/package.json'));
const compilerPath = path.join(packageDirectory, 'bin', 'tsc');
const result = spawnSync(process.execPath, [compilerPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
