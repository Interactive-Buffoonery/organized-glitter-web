const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const {
  chmodSync,
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function syncHooks(rootDir, localDir) {
  const modulePath = pathToFileURL(path.resolve('scripts/sync-local-pocketbase-hooks.mjs'));
  const { syncLocalPocketBaseHooks } = await import(modulePath.href);
  return syncLocalPocketBaseHooks(rootDir, localDir);
}

function makeFixture() {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'og-local-hooks-'));
  const localDir = path.join(rootDir, 'local-pb-db');
  mkdirSync(path.join(rootDir, 'pb_hooks'));
  mkdirSync(path.join(localDir, 'pb_hooks'), { recursive: true });
  return { rootDir, localDir };
}

function addStaleHook(rootDir, localDir) {
  const stalePath = path.join(localDir, 'pb_hooks', 'old-route.pb.js');
  writeFileSync(path.join(rootDir, 'pb_hooks', 'new-route.pb.js'), 'new route');
  writeFileSync(stalePath, 'old route');
  return stalePath;
}

describe('local PocketBase hook sync', () => {
  it('stops on stale hook entry points and preserves the local file', async () => {
    const { rootDir, localDir } = makeFixture();
    const stalePath = addStaleHook(rootDir, localDir);

    await assert.rejects(syncHooks(rootDir, localDir), /old-route\.pb\.js/);
    assert.equal(readFileSync(stalePath, 'utf8'), 'old route');
  });

  it('copies current entry points and helper modules', async () => {
    const { rootDir, localDir } = makeFixture();
    writeFileSync(path.join(rootDir, 'pb_hooks', 'route.pb.js'), 'route');
    writeFileSync(path.join(rootDir, 'pb_hooks', 'helper.js'), 'helper');

    await syncHooks(rootDir, localDir);

    assert.equal(readFileSync(path.join(localDir, 'pb_hooks', 'route.pb.js'), 'utf8'), 'route');
    assert.equal(readFileSync(path.join(localDir, 'pb_hooks', 'helper.js'), 'utf8'), 'helper');
  });

  it('stops the shell startup before launching PocketBase', () => {
    const { rootDir, localDir } = makeFixture();
    const stalePath = addStaleHook(rootDir, localDir);
    const binaryPath = path.join(localDir, 'pocketbase');
    writeFileSync(binaryPath, '#!/bin/sh\nexit 0\n');
    chmodSync(binaryPath, 0o755);
    mkdirSync(path.join(rootDir, 'scripts'));
    copyFileSync(
      'scripts/sync-local-pocketbase-hooks.mjs',
      path.join(rootDir, 'scripts', 'sync-local-pocketbase-hooks.mjs')
    );

    const result = spawnSync('bash', [path.resolve('start-local-dev.sh')], {
      cwd: rootDir,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /old-route\.pb\.js/);
    assert.doesNotMatch(result.stdout, /Starting PocketBase locally with CORS enabled/);
    assert.equal(readFileSync(stalePath, 'utf8'), 'old route');
  });

  it('stops bootstrap before launching PocketBase', () => {
    const { rootDir, localDir } = makeFixture();
    const stalePath = addStaleHook(rootDir, localDir);
    writeFileSync(path.join(localDir, 'pocketbase'), 'placeholder');
    writeFileSync(path.join(localDir, 'pb_schema.json'), '{}');

    const result = spawnSync(
      process.execPath,
      [path.resolve('scripts/bootstrap-local-pocketbase.mjs'), '--no-keepalive'],
      {
        cwd: rootDir,
        encoding: 'utf8',
        env: {
          ...process.env,
          LOCAL_POCKETBASE_DIR: localDir,
          LOCAL_POCKETBASE_URL: 'http://localhost:8090',
          VITE_POCKETBASE_URL: 'http://localhost:8090',
        },
      }
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /old-route\.pb\.js/);
    assert.equal(readFileSync(stalePath, 'utf8'), 'old route');
  });
});
