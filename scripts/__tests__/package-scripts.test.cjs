const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');

const packageJson = require('../../package.json');

function runPnpmExec(...args) {
  const pnpmCli = process.env.npm_execpath;

  return pnpmCli
    ? execFileSync(process.execPath, [pnpmCli, 'exec', ...args], { encoding: 'utf8' }).trim()
    : execFileSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['exec', ...args], {
        encoding: 'utf8',
      }).trim();
}

describe('package scripts', () => {
  it('routes local PocketBase admin creation through the wrapper', () => {
    const script = packageJson.scripts['pb:create-admin'];

    assert.equal(script, 'dotenv -e .env -- node scripts/upsert-local-pocketbase-superuser.mjs');
  });

  it('runs PocketBase migrations from the local-pb-db directory', () => {
    const script = readFileSync('scripts/upsert-local-pocketbase-superuser.mjs', 'utf8');

    assert.match(script, /const localDir = path\.join\(rootDir, 'local-pb-db'\);/);
    assert.match(script, /cwd: localDir/);
  });

  it('exposes the local release QA harness through a package script', () => {
    assert.equal(packageJson.scripts['qa:release:local'], 'node scripts/run-local-release-qa.mjs');
  });

  it('exposes complete local CI phases through stable package scripts', () => {
    assert.equal(
      packageJson.scripts['test:ci:static'],
      'node scripts/generate-not-found.mjs --check && pnpm typecheck && pnpm format:check && pnpm lint && pnpm lint:pb-boundary && pnpm lint:workflows && node --test e2e/ci/browser-inventory.test.mjs'
    );
    assert.equal(
      packageJson.scripts['test:ci:backend'],
      'pnpm pb:test:examples && pnpm pb:validate:schema && pnpm pb:validate:migrations && pnpm pb:validate:upgrade && pnpm pb:test:protected-file-upgrade && pnpm pb:test:auth-verification && pnpm pb:test:feedback && pnpm pb:test:native-oauth-association && pnpm pb:test:auth-step-up && pnpm pb:test:native-apple && pnpm pb:test:archive-restore-v3 && pnpm pb:test:mobile-sync && pnpm pb:test:stats && pnpm pb:test:account-deletion'
    );
    assert.equal(packageJson.scripts['test:ci:build'], 'pnpm build && pnpm build:budget');
    assert.equal(
      packageJson.scripts['test:publication'],
      'node scripts/run-publication-validation.mjs'
    );
    assert.equal(
      packageJson.scripts['qa:browser:full:ci'],
      'node scripts/run-local-release-qa.mjs --suite=full --fixed-ports --run-id=ci-full'
    );
  });

  it('routes PR and release gates through the timed local orchestrator', () => {
    assert.equal(
      packageJson.scripts['test:pr'],
      'node scripts/run-local-validation.mjs --profile=pr --base=${VALIDATION_BASE_REF:-origin/dev}'
    );
    assert.equal(
      packageJson.scripts['test:release'],
      'node scripts/run-local-validation.mjs --profile=release --base=${VALIDATION_BASE_REF:-origin/main}'
    );
  });

  it('exposes the stats PocketBase integration check', () => {
    assert.equal(packageJson.scripts['pb:test:stats'], 'node scripts/test-stats-pocketbase.mjs');
  });

  it('routes application typechecking through the native TypeScript 7 runner', () => {
    assert.equal(packageJson.scripts['tsc:ts7'], 'node scripts/run-typescript-7.mjs');
    assert.equal(
      packageJson.scripts.typecheck,
      'pnpm tsc:ts7 -p tsconfig.app.json --noEmit && pnpm tsc:ts7 -p tsconfig.node.json --noEmit'
    );
    assert.equal(packageJson.devDependencies['@typescript/native'], 'npm:typescript@7.0.2');
    assert.equal(packageJson.devDependencies.typescript, 'npm:@typescript/typescript6@6.0.2');
  });

  it('resolves tsc6 to the TypeScript 6 compatibility compiler', () => {
    const version = runPnpmExec('tsc6', '--version');

    assert.match(version, /^Version 6\.\d+\.\d+$/);
  });

  it('allows bootstrap to target an isolated local PocketBase directory', () => {
    const script = readFileSync('scripts/bootstrap-local-pocketbase.mjs', 'utf8');

    assert.match(script, /process\.env\.LOCAL_POCKETBASE_DIR \|\| 'local-pb-db'/);
  });

  it('seeds local E2E users past the coloring walkthrough', () => {
    const script = readFileSync('scripts/bootstrap-local-pocketbase.mjs', 'utf8');
    const seedPayloadMarkers = [
      'upsertSeedUser(localUrl, token, userId, {',
      "upsertSeedUser(localUrl, token, 'localuser000002', {",
    ];

    assert.match(script, /const userId = 'localuser000001'/);

    for (const marker of seedPayloadMarkers) {
      const payloadStart = script.indexOf(marker);
      const payloadEnd = script.indexOf('\n  });', payloadStart);

      assert.notEqual(payloadStart, -1, `missing seed payload starting with ${marker}`);
      assert.notEqual(payloadEnd, -1, `unterminated seed payload starting with ${marker}`);
      assert.match(script.slice(payloadStart, payloadEnd), /coloring_walkthrough_seen: true/);
    }
  });

  it('keeps release QA run directories inside the ignored harness directory', () => {
    const script = readFileSync('scripts/run-local-release-qa.mjs', 'utf8');

    assert.match(
      script,
      /const runRoot = path\.join\(rootDir, '\.tmp', 'pocketbase-release-qa'\);/
    );
    assert.match(script, /const runDir = path\.resolve\(runRoot, runId\);/);
    assert.match(script, /path\.relative\(runRoot, runDir\)/);
    assert.match(script, /relativeRunDir\.startsWith\('\.\.'\)/);
    assert.match(script, /path\.isAbsolute\(relativeRunDir\)/);
  });

  it('targets dependency updates at the integration branch', () => {
    const config = readFileSync('.github/dependabot.yml', 'utf8');

    assert.match(config, /^\s+target-branch: dev$/m);
  });
});
