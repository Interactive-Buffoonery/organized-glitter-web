import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  readFileSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

// Real-runtime failures: bad config must close both gates without leaking secrets;
// backups must omit keys, and restores must preserve the separately held key.
export async function testAppleConfiguration(fixture, request, adminHeaders) {
  const { baseUrl, configPath, appleConfig, dataDir, logPath } = fixture;
  const configDir = path.dirname(configPath);
  const original = readFileSync(configPath);
  const unavailable = async () => {
    const readiness = await request(`${baseUrl}/api/auth/apple/native/readiness`);
    assert.equal(readiness.status, 200);
    assert.deepEqual(readiness.body, { available: false });
    const result = await request(`${baseUrl}/api/auth/apple/native`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'config-check', nonce: 'disposable_test_nonce_1234567890' }),
    });
    assert.equal(result.status, 503);
    assert.equal(result.headers.get('retry-after'), '30');
    assert.equal(result.body.data.reason.code, 'apple_unavailable');
    assert.ok(!JSON.stringify(result.body).includes('config-check-secret'));
  };
  try {
    renameSync(configPath, `${configPath}.held`);
    await unavailable();
    renameSync(`${configPath}.held`, configPath);
    for (const invalid of [
      '{"config-check-secret":',
      'null',
      '[]',
      JSON.stringify({ ...appleConfig, teamId: '' }),
      JSON.stringify({ ...appleConfig, keyId: '' }),
      JSON.stringify({ ...appleConfig, privateKey: 'config-check-secret' }),
      JSON.stringify({
        ...appleConfig,
        privateKey: '-----BEGIN PRIVATE KEY-----\nconfig-check-secret\n-----END PRIVATE KEY-----',
      }),
      JSON.stringify({ ...appleConfig, grantEncryptionKey: 'é'.repeat(32) }),
      JSON.stringify({ ...appleConfig, grantEncryptionKey: '' }),
    ]) {
      writeFileSync(configPath, invalid);
      await unavailable();
    }
    writeFileSync(configPath, original);
    writeFileSync(configPath, `${original.toString()}${' '.repeat(16385)}`);
    await unavailable();
    writeFileSync(configPath, original);
    chmodSync(configPath, 0o644);
    await unavailable();
    chmodSync(configPath, 0o600);
    chmodSync(configDir, 0o755);
    await unavailable();
    chmodSync(configDir, 0o700);
    renameSync(configPath, `${configPath}.held`);
    symlinkSync(`${configPath}.held`, configPath);
    await unavailable();
    unlinkSync(configPath);
    renameSync(`${configPath}.held`, configPath);
    renameSync(configPath, `${configPath}.held`);
    chmodSync(`${configPath}.held`, 0o644);
    symlinkSync(`${configPath}.held`, configPath);
    await unavailable();
    unlinkSync(configPath);
    renameSync(`${configPath}.held`, configPath);
    chmodSync(configPath, 0o600);
  } finally {
    if (existsSync(`${configPath}.held`)) renameSync(`${configPath}.held`, configPath);
    writeFileSync(configPath, original);
    chmodSync(configPath, 0o600);
    chmodSync(configDir, 0o700);
  }
  const readiness = await request(`${baseUrl}/api/auth/apple/native/readiness`);
  assert.equal(readiness.status, 200);
  assert.deepEqual(readiness.body, { available: true });
  for (const url of [
    '/apple-auth-private/config.json',
    '/pb_data/apple-auth-private/config.json',
    '/api/files/apple-auth-private/config.json',
  ]) {
    const response = await fetch(baseUrl + url);
    assert.equal(response.status, 404, `private config is not served at ${url}`);
    assert.ok(!(await response.text()).includes(appleConfig.grantEncryptionKey));
  }
  let diagnostics = [];
  for (let attempt = 0; attempt < 80; attempt++) {
    const response = await request(
      `${baseUrl}/api/logs?perPage=100&filter=${encodeURIComponent('data.reason ~ "apple_config_"')}`,
      { headers: adminHeaders }
    );
    assert.equal(response.status, 200);
    diagnostics = response.body.items;
    if (diagnostics.some(item => item.data.reason === 'apple_config_unsafe_file')) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  for (const reason of [
    'apple_config_unreadable',
    'apple_config_invalid_json',
    'apple_config_unsafe_file',
    'apple_config_invalid_signing_key',
    'apple_config_invalid_grant_key',
  ]) {
    assert.ok(
      diagnostics.some(item => item.data.reason === reason),
      `server diagnostic records ${reason}`
    );
  }
  const diagnosticText = JSON.stringify(diagnostics);
  for (const secret of [
    appleConfig.privateKey,
    appleConfig.grantEncryptionKey,
    'config-check-secret',
  ]) {
    assert.ok(!diagnosticText.includes(secret), 'stored diagnostics contain no secret values');
  }
  const backupName = 'apple-config-test.zip';
  const backupPath = path.join(dataDir, 'backups', backupName);
  const backup = await request(`${baseUrl}/api/backups`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ name: backupName }),
  });
  assert.equal(backup.status, 204);
  let archive;
  for (let attempt = 0; attempt < 100; attempt++) {
    archive = spawnSync('unzip', ['-Z1', backupPath], { encoding: 'utf8' });
    if (archive.status === 0) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(archive.status, 0, 'a real PocketBase backup completes');
  assert.ok(archive.stdout.includes('data.db'));
  assert.ok(
    !archive.stdout.includes('apple-auth-private'),
    'backup excludes the entire private directory'
  );
  const marker = path.join(dataDir, 'after-backup-marker');
  writeFileSync(marker, 'restore must remove this');
  const restore = await request(`${baseUrl}/api/backups/${backupName}/restore`, {
    method: 'POST',
    headers: adminHeaders,
  });
  assert.equal(restore.status, 204);
  let restored = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    try {
      const readiness = await request(`${baseUrl}/api/auth/apple/native/readiness`);
      restored =
        !existsSync(marker) && readiness.status === 200 && readiness.body?.available === true;
    } catch {}
    if (restored) break;
  }
  assert.ok(restored, 'real backup restore preserves a working private config');
  assert.deepEqual(
    readFileSync(configPath),
    original,
    'restore does not replace the encryption key'
  );
  const logs = readFileSync(logPath, 'utf8');
  for (const secret of [
    appleConfig.privateKey,
    appleConfig.grantEncryptionKey,
    'config-check-secret',
  ]) {
    assert.ok(!logs.includes(secret), 'configuration diagnostics never print secret values');
  }
}
