import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import PocketBase from 'pocketbase';
import { installPocketBase } from './install-pocketbase.mjs';

const root = process.cwd();
const directory = mkdtempSync(path.join(tmpdir(), 'og-feedback-pb-'));
const dataDir = path.join(directory, 'data');
const hooksDir = path.join(directory, 'hooks');
const migrationsDir = path.join(directory, 'migrations');
mkdirSync(hooksDir);
mkdirSync(migrationsDir);
copyFileSync(path.join(root, 'pb_hooks/feedback.pb.js'), path.join(hooksDir, 'feedback.pb.js'));
// Omitting e.next() stops PocketBase before SMTP or sendmail while recording the handoff.
writeFileSync(
  path.join(hooksDir, 'test-mail.pb.js'),
  `onMailerSend(e => { console.log('FEEDBACK_TEST_MAIL:' + e.message.subject); });\n`
);

const binary = await installPocketBase({
  destination: path.join(root, '.tmp/test-tools/pocketbase'),
});
const socket = net.createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const url = `http://127.0.0.1:${port}`;
const password = 'feedback-smoke-password-123';
const adminEmail = 'feedback-admin@example.test';
const setup = spawnSync(binary, ['superuser', 'upsert', adminEmail, password, `--dir=${dataDir}`], {
  encoding: 'utf8',
});
assert.equal(setup.status, 0, setup.stderr);

let output = '';
const server = spawn(
  binary,
  [
    'serve',
    `--http=127.0.0.1:${port}`,
    `--dir=${dataDir}`,
    `--hooksDir=${hooksDir}`,
    `--migrationsDir=${migrationsDir}`,
  ],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FEEDBACK_TO_EMAIL: 'feedback@example.test' },
  }
);
server.stdout.on('data', chunk => (output += chunk.toString()));
server.stderr.on('data', chunk => (output += chunk.toString()));

try {
  const admin = new PocketBase(url);
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`PocketBase stopped: ${output}`);
    try {
      await admin.health.check();
      break;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  await admin.collection('_superusers').authWithPassword(adminEmail, password);
  const schema = JSON.parse(
    readFileSync(path.join(root, 'docs/pocketbase/collections.schema.json'), 'utf8')
  );
  await admin.collections.import(schema, false);
  const user = await admin.collection('users').create({
    email: 'feedback-user@example.test',
    username: 'feedback-user',
    password,
    passwordConfirm: password,
    verified: true,
  });
  const client = new PocketBase(url);
  await client.collection('users').authWithPassword(user.email, password);
  const endpoint = `${url}/api/organized-glitter/feedback`;
  const anonymous = await fetch(endpoint, { method: 'POST' });
  assert.equal(anonymous.status, 401);
  const rejected = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: client.authStore.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedback: 'A valid message', userId: 'spoofed' }),
  });
  assert.equal(rejected.status, 400, await rejected.text());
  const accepted = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: client.authStore.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedback: 'A controlled test message.', type: 'bug' }),
  });
  assert.equal(accepted.status, 200, await accepted.text());
  assert.match(output, /FEEDBACK_TEST_MAIL:New bug Feedback - Organized Glitter/);
  for (let i = 0; i < 4; i++) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: client.authStore.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: 'A controlled test message.' }),
    });
    assert.equal(response.status, 200, await response.text());
  }
  const limited = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: client.authStore.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedback: 'A controlled test message.' }),
  });
  assert.equal(limited.status, 429, await limited.text());
  const largeUser = await admin.collection('users').create({
    email: 'large-feedback@example.test',
    username: 'large-feedback',
    password,
    passwordConfirm: password,
    verified: true,
  });
  const largeClient = new PocketBase(url);
  await largeClient.collection('users').authWithPassword(largeUser.email, password);
  const largeBody = JSON.stringify({ feedback: '\u0001'.repeat(5000) });
  assert.ok(Buffer.byteLength(largeBody) > 16384);
  assert.ok(Buffer.byteLength(largeBody) < 32768);
  const largeResponse = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: largeClient.authStore.token, 'Content-Type': 'application/json' },
    body: largeBody,
  });
  assert.equal(largeResponse.status, 200, await largeResponse.text());
  const concurrentUser = await admin.collection('users').create({
    email: 'concurrent-feedback@example.test',
    username: 'concurrent-feedback',
    password,
    passwordConfirm: password,
    verified: true,
  });
  const concurrentClient = new PocketBase(url);
  await concurrentClient.collection('users').authWithPassword(concurrentUser.email, password);
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, async () => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: concurrentClient.authStore.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ feedback: 'A concurrent test message.' }),
      });
      return response.status;
    })
  );
  const failures = results.flatMap((result, index) =>
    result.status === 'rejected' ? [`request ${index + 1}: ${String(result.reason)}`] : []
  );
  assert.deepEqual(failures, [], 'All concurrent requests should receive an HTTP response');
  const statuses = results.map(result => result.value);
  assert.equal(statuses.filter(status => status === 200).length, 5);
  assert.equal(statuses.filter(status => status === 429).length, 3);
  console.log('PocketBase feedback route: auth, spoofing, mail handoff, and quota passed');
} finally {
  await new Promise(resolve => {
    if (server.exitCode !== null || server.signalCode !== null) return resolve();
    server.once('exit', resolve);
    server.kill('SIGTERM');
  });
  rmSync(directory, { recursive: true, force: true });
}
