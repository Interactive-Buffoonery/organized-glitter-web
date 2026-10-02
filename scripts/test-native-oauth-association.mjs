import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { installPocketBase } from './install-pocketbase.mjs';

// Exercise the actual HTTP route: a mock cannot catch static-route precedence,
// an authentication requirement, a redirect, or the wrong response content type.
const directory = mkdtempSync(path.join(tmpdir(), 'og-native-association-'));
let socket;
let server;
try {
  const hooks = path.join(directory, 'hooks');
  const migrations = path.join(directory, 'migrations');
  mkdirSync(hooks);
  mkdirSync(migrations);
  const source = path.resolve('pb_hooks/native_association.pb.js');
  if (existsSync(source)) copyFileSync(source, path.join(hooks, 'native_association.pb.js'));
  const binary = await installPocketBase({
    destination: path.resolve('.tmp/test-tools/pocketbase'),
  });
  socket = net.createServer();
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const baseURL = `http://127.0.0.1:${port}`;
  server = spawn(
    binary,
    [
      'serve',
      `--http=127.0.0.1:${port}`,
      `--dir=${directory}/data`,
      `--hooksDir=${hooks}`,
      `--migrationsDir=${migrations}`,
    ],
    { stdio: 'ignore' }
  );
  let startupError;
  server.once('error', error => {
    startupError = error;
  });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (startupError) throw startupError;
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error('Disposable PocketBase stopped before becoming healthy');
    }
    try {
      if ((await fetch(`${baseURL}/api/health`, { signal: AbortSignal.timeout(500) })).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  if (!ready) throw new Error('Disposable PocketBase did not become healthy');
  const response = await fetch(`${baseURL}/.well-known/apple-app-site-association`, {
    redirect: 'manual',
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^application\/json/);
  assert.deepEqual(await response.json(), {
    webcredentials: { apps: ['7CNK4YPCQX.com.interactivebuffoonery.organizedglitter'] },
  });
  // The web callback keeps its existing missing-state failure redirect.
  const callback = await fetch(`${baseURL}/api/oauth2-redirect`, { redirect: 'manual' });
  assert.equal(callback.status, 307);
  assert.match(callback.headers.get('location'), /oauth2-redirect-failure$/);
  console.log('Native association HTTP checks passed');
} finally {
  if (socket?.listening) await new Promise(resolve => socket.close(resolve));
  if (server?.pid && server.exitCode === null && server.signalCode === null) {
    const stopped = new Promise(resolve => server.once('close', resolve));
    server.kill('SIGTERM');
    const forceStop = setTimeout(() => server.kill('SIGKILL'), 1_000);
    try {
      await stopped;
    } finally {
      clearTimeout(forceStop);
    }
  }
  rmSync(directory, { recursive: true, force: true });
}
