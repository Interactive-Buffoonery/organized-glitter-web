import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, openSync, closeSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { installPocketBase } from '../../install-pocketbase.mjs';
import { testAppleGrantMigration } from '../apple-grant-migration.mjs';

export async function startAppleFixture() {
  const root = process.cwd();
  mkdirSync('.tmp', { recursive: true });
  const runDir = mkdtempSync(path.join(root, '.tmp/native-apple-auth-'));
  const hooksDir = path.join(runDir, 'pb_hooks');
  const migrationsDir = path.join(runDir, 'pb_migrations');
  const dataDir = path.join(runDir, 'pb_data');
  const revokeRequests = [];
  let revokeStatus = 503;
  mkdirSync(hooksDir);
  mkdirSync(migrationsDir);

  const oauthServer = createServer((incoming, outgoing) => {
    outgoing.setHeader('Content-Type', 'application/json');
    if (incoming.url === '/token') {
      let body = '';
      incoming.on('data', chunk => (body += chunk));
      incoming.on('end', () => {
        const code = new URLSearchParams(body).get('code');
        outgoing.end(JSON.stringify({
          access_token: code === 'web-no-refresh' ? 'disposable-success' : `disposable-${code}`,
          ...(code === 'web-no-refresh' ? {} : { refresh_token: code === 'web-refresh-fail' ? 'disposable-web-refresh-fail-token' : 'disposable-web-refresh-token' }),
          token_type: 'Bearer',
        }));
      });
    } else if (incoming.url === '/revoke') {
      let body = '';
      incoming.on('data', chunk => (body += chunk));
      incoming.on('end', () => {
        revokeRequests.push(Object.fromEntries(new URLSearchParams(body)));
        outgoing.writeHead(revokeStatus);
        outgoing.end(revokeStatus === 200 ? '' : JSON.stringify({ error: 'server_error' }));
      });
    } else if (incoming.url === '/apple-invalid' || incoming.url === '/apple-unavailable') {
      outgoing.writeHead(incoming.url === '/apple-invalid' ? 400 : 503);
      outgoing.end(JSON.stringify({ error: incoming.url === '/apple-invalid' ? 'invalid_grant' : 'server_error' }));
    } else if (incoming.url === '/user') {
      const webFailure = incoming.headers.authorization === 'Bearer disposable-web-fail';
      const dbFailure = incoming.headers.authorization === 'Bearer disposable-web-db-fail';
      const mixedRepair = incoming.headers.authorization === 'Bearer disposable-mixed-repair';
      const success = incoming.headers.authorization === 'Bearer disposable-success' || incoming.headers.authorization === 'Bearer disposable-web-refresh-fail' || webFailure;
      outgoing.end(JSON.stringify({
        id: mixedRepair ? 'disposable-mixed-repair' : dbFailure ? 'disposable-web-db-fail' : webFailure ? 'disposable-web-fail' : success ? 'disposable-web-user' : 'disposable-no-email-user',
        username: success ? 'webtestuser' : 'noemailuser',
        ...(success || dbFailure || mixedRepair ? { email: mixedRepair ? 'mixedrepair@localhost.test' : dbFailure ? 'webdbfail@localhost.test' : webFailure ? 'webfail@localhost.test' : 'webtest@localhost.test', verified: true } : {}),
      }));
    } else {
      outgoing.writeHead(404).end();
    }
  });

  const freePort = () => new Promise(resolve => {
    const socket = net.createServer();
    socket.listen(0, '127.0.0.1', () => {
      const port = socket.address().port;
      socket.close(() => resolve(port));
    });
  });

  let processHandle;
  let logFd;
  const close = async () => {
    if (processHandle && processHandle.exitCode === null && processHandle.signalCode === null) {
      const exited = new Promise(resolve => processHandle.once('exit', resolve));
      processHandle.kill('SIGTERM');
      await exited;
    }
    if (logFd !== undefined) closeSync(logFd);
    await new Promise(resolve => oauthServer.close(resolve));
  };
  try {
    await new Promise(resolve => oauthServer.listen(0, '127.0.0.1', resolve));
    const oauthUrl = `http://127.0.0.1:${oauthServer.address().port}`;
    for (const file of ['native_apple_auth.pb.js', 'auth_sign_in_methods.pb.js', 'apple_grants.pb.js', 'apple_grant_store.js', 'apple_web_grant.js', 'apple_revocation.js']) {
      copyFileSync(path.join(root, 'pb_hooks', file), path.join(hooksDir, file));
    }
    for (const file of ['apple_config.js', 'apple_config_backup.pb.js']) {
      copyFileSync(path.join(root, 'pb_hooks', file), path.join(hooksDir, file));
    }
    copyFileSync(path.join(root, 'pb_hooks/native_apple.js'), path.join(hooksDir, 'native_apple.production.js'));
    for (const file of ['native_apple.js', 'web_apple.pb.js']) {
      copyFileSync(path.join(root, 'scripts/test-support/apple', file), path.join(hooksDir, file));
    }
    copyFileSync(path.join(root, 'scripts/test-support/apple/revocation_test.pb.js'), path.join(hooksDir, 'zz_revocation_test.pb.js'));
    copyFileSync(path.join(root, 'pb_migrations/1790496000_apple_grants.js'), path.join(migrationsDir, '1790496000_apple_grants.js'));

    const binary = await installPocketBase({ destination: path.join(root, '.tmp/pocketbase-cache/0.40.4/pocketbase') });
    testAppleGrantMigration(binary, root, runDir);
    const adminEmail = 'apple-test-admin@localhost.test';
    const adminPassword = 'apple-test-admin-password-123';
    const setup = spawnSync(binary, ['superuser', 'upsert', adminEmail, adminPassword, `--dir=${dataDir}`], { encoding: 'utf8' });
    assert.equal(setup.status, 0, setup.stderr);

    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const configDir = path.join(dataDir, 'apple-auth-private');
    mkdirSync(configDir, { mode: 0o700 });
    const configPath = path.join(configDir, 'config.json');
    const appleConfig = {
      teamId: 'AAAAAAAAAA', keyId: 'BBBBBBBBBB',
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      grantEncryptionKey: '12345678901234567890123456789012',
    };
    writeFileSync(configPath, JSON.stringify(appleConfig), { mode: 0o600 });
    const logPath = path.join(runDir, 'pocketbase.log');
    logFd = openSync(logPath, 'a', 0o600);
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    processHandle = spawn(binary, ['serve', `--http=127.0.0.1:${port}`, `--dir=${dataDir}`, `--hooksDir=${hooksDir}`, `--migrationsDir=${migrationsDir}`], {
      cwd: runDir,
      env: {
        ...process.env,
        TEST_APPLE_OAUTH_URL: oauthUrl,
        APPLE_NATIVE_CLIENT_ID: '', APPLE_TEAM_ID: '', APPLE_KEY_ID: '',
        APPLE_PRIVATE_KEY: '', APPLE_GRANT_ENCRYPTION_KEY: '',
      },
      stdio: ['ignore', logFd, logFd],
    });

    let healthy = false;
    for (let i = 0; i < 100; i++) {
      try { healthy = (await fetch(`${baseUrl}/api/health`)).ok; } catch {}
      if (healthy) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(healthy, 'PocketBase starts with Apple hooks and migration');

    return {
      root, runDir, dataDir, baseUrl, oauthUrl, adminEmail, adminPassword,
      configPath, appleConfig, logPath, close, revokeRequests,
      setRevokeStatus(status) { revokeStatus = status; },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
