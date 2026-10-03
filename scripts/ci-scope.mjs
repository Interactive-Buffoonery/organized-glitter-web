import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const zeroSha = /^0+$/;

export const BROAD_CI_BASE = '04789b9d000e6eb1390ca2a6ae60f855a3b1fca6';

const git = args => {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || '').trim()}`);
  }
  return result.stdout;
};

const requireValue = (value, label) => {
  if (!value) throw new Error(`${label} is required.`);
  return value;
};

export function resolveComparison({
  eventName,
  pullRequestBaseSha,
  pushBeforeSha,
  explicitBase,
  branchCreationBase,
  headSha,
}) {
  const head = requireValue(headSha, 'CI head SHA');
  if (eventName === 'pull_request') {
    const base = requireValue(pullRequestBaseSha, 'Pull request base SHA');
    return { base, head, range: `${base}...${head}` };
  }
  if (eventName === 'push') {
    const before = requireValue(pushBeforeSha, 'Push before SHA');
    if (zeroSha.test(before)) {
      const base = requireValue(branchCreationBase, 'Branch creation baseline');
      return { base, head, range: `${base}..${head}`, branchCreation: true };
    }
    const base = before;
    return { base, head, range: `${base}..${head}` };
  }
  if (eventName === 'schedule' || eventName === 'workflow_dispatch') {
    const base = requireValue(explicitBase, 'Explicit comparison baseline');
    return { base, head, range: `${base}..${head}` };
  }
  throw new Error(`Unsupported CI event: ${eventName || '(missing)'}.`);
}

const isOrdinaryDocumentation = filePath =>
  filePath.endsWith('.md') && (!filePath.includes('/') || filePath.startsWith('docs/'));

const isSharedOrSensitive = filePath => {
  const lowerPath = filePath.toLowerCase();
  const sharedApplicationPath =
    filePath === 'src/main.tsx' ||
    filePath === 'src/App.tsx' ||
    filePath === 'src/components/layout/AppProviders.tsx' ||
    lowerPath.includes('auth') ||
    lowerPath.includes('pocketbase') ||
    lowerPath.includes('routing/') ||
    lowerPath.includes('router') ||
    /(^|[-_.])env([-_.]|$)/.test(lowerPath) ||
    lowerPath.includes('config');

  return (
    /(^|\/)(__tests__|tests?|e2e)(\/|$)/.test(filePath) ||
    /\.(test|spec)\.[^/]+$/.test(filePath) ||
    /(^|\/)[^.][^/]*\.config\.[^/]+$/.test(filePath) ||
    filePath.startsWith('.github/') ||
    filePath.startsWith('scripts/') ||
    filePath === 'package.json' ||
    filePath === 'pnpm-lock.yaml' ||
    filePath === 'tsconfig.json' ||
    filePath.startsWith('src/hooks/queries/') ||
    filePath.startsWith('src/hooks/mutations/') ||
    (filePath.startsWith('src/') && sharedApplicationPath)
  );
};

const isBackendPath = filePath =>
  filePath.startsWith('api/') ||
  filePath.startsWith('server/') ||
  filePath.startsWith('pb_hooks/') ||
  filePath.startsWith('pb_migrations/') ||
  filePath.startsWith('docs/pocketbase/') ||
  filePath === 'pocketbase';

const isBrowserPath = filePath =>
  filePath.startsWith('src/') ||
  filePath.startsWith('public/') ||
  filePath.startsWith('blog/') ||
  filePath === 'index.html' ||
  /\.(css|html|svg|png|jpe?g|webp|woff2?)$/i.test(filePath);

const readChangedPaths = (comparison, gitFn) =>
  gitFn(['diff', '--name-only', '--no-renames', '-z', comparison.range])
    .split('\0')
    .filter(Boolean);

export function classifyCiScope(paths, context = {}) {
  const { eventName, targetBranch, comparison, gitFn = git } = context;
  const changedPaths = paths ?? readChangedPaths(comparison, gitFn);
  const full =
    eventName === 'schedule' ||
    eventName === 'workflow_dispatch' ||
    targetBranch === 'main' ||
    comparison?.branchCreation === true;

  if (full) {
    return {
      backend: true,
      browser: true,
      full: true,
      reason: 'release, branch creation, scheduled, or manual run',
    };
  }
  if (changedPaths.length > 0 && changedPaths.every(isOrdinaryDocumentation)) {
    return {
      backend: false,
      browser: false,
      full: false,
      reason: 'ordinary documentation only',
    };
  }
  if (changedPaths.some(filePath => isSharedOrSensitive(filePath) || isBackendPath(filePath))) {
    return {
      backend: true,
      browser: true,
      full: false,
      reason: 'backend or shared changes',
    };
  }
  if (changedPaths.length > 0 && changedPaths.every(isBrowserPath)) {
    return {
      backend: false,
      browser: true,
      full: false,
      reason: 'browser-facing changes',
    };
  }
  return {
    backend: true,
    browser: true,
    full: false,
    reason: changedPaths.length === 0 ? 'no changed paths resolved' : 'unclassified changes',
  };
}

export const resolveGitCommit = (ref, { fetchMissing = false, gitFn = git } = {}) => {
  try {
    return gitFn(['rev-parse', '--verify', `${ref}^{commit}`]).trim();
  } catch (error) {
    if (!fetchMissing) throw error;
    gitFn(['fetch', '--no-tags', '--depth=1', 'origin', ref]);
    return gitFn(['rev-parse', '--verify', `${ref}^{commit}`]).trim();
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const rawComparison = resolveComparison({
      eventName: process.env.CI_EVENT_NAME,
      pullRequestBaseSha: process.env.CI_PULL_REQUEST_BASE_SHA,
      pushBeforeSha: process.env.CI_PUSH_BEFORE_SHA,
      explicitBase: process.env.CI_EXPLICIT_BASE,
      branchCreationBase: process.env.CI_BRANCH_CREATION_BASE,
      headSha: process.env.CI_HEAD_SHA,
    });
    const base = resolveGitCommit(rawComparison.base, {
      fetchMissing: process.env.CI_EVENT_NAME === 'push',
    });
    const head = resolveGitCommit(rawComparison.head);
    const separator = process.env.CI_EVENT_NAME === 'pull_request' ? '...' : '..';
    const comparison = {
      base,
      head,
      range: `${base}${separator}${head}`,
      branchCreation: rawComparison.branchCreation === true,
    };
    const scope = classifyCiScope(undefined, {
      comparison,
      eventName: process.env.CI_EVENT_NAME,
      targetBranch: process.env.CI_TARGET_BRANCH,
    });
    const plan = JSON.stringify({ backend: scope.backend, browser: scope.browser });
    const outputs = [
      `base_sha=${base}`,
      `run_backend=${scope.backend}`,
      `run_browser=${scope.browser}`,
      `run_full_browser=${scope.full}`,
      `plan=${plan}`,
    ].join('\n');
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${outputs}\n`);
    process.stdout.write(`${JSON.stringify({ base, head, ...scope }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
