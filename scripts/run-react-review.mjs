import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const BOOTSTRAP_REVIEW_BASE = '30aebeccf408ce7aa2cb3fdea55e06de1d838ecc';

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Cannot resolve public React review baseline');
  return result.stdout;
}

export function resolveReactReviewBase(base, gitFn = git) {
  const tree = gitFn(['ls-tree', '--name-only', base]).trim();
  const parents = gitFn(['show', '-s', '--format=%P', base]).trim();
  if (tree || parents) return base;
  gitFn(['merge-base', '--is-ancestor', BOOTSTRAP_REVIEW_BASE, 'HEAD']);
  return BOOTSTRAP_REVIEW_BASE;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = resolveReactReviewBase(
    process.env.CI_BASE_SHA || process.env.CI_BASE_REF || 'origin/main'
  );
  console.log(`React review base: ${base}`);
  const result = spawnSync(
    'npx',
    [
      '--yes',
      'react-doctor@0.9.14',
      '.',
      '--verbose',
      '--blocking',
      'error',
      '--scope',
      'changed',
      '--base',
      base,
    ],
    {
      env: { ...process.env, REACT_DOCTOR_NO_TELEMETRY: '1' },
      stdio: 'inherit',
    }
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
