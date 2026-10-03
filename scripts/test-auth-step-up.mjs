#!/usr/bin/env node

import { spawn } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
} from 'node:fs';
import net from 'node:net';
import { createServer } from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { installPocketBase, POCKETBASE_VERSION } from './install-pocketbase.mjs';
import { upsertLocalPocketBaseSuperuser } from './upsert-local-pocketbase-superuser.mjs';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const runDir = path.join(rootDir, '.tmp', `auth-step-up-${Date.now()}`);
const dataDir = path.join(runDir, 'pocketbase');
const hooksDir = path.join(dataDir, 'pb_hooks');
const binary = path.join(dataDir, 'pocketbase');
const adminEmail = 'auth-step-up-admin@localhost.test';
const adminPassword = 'auth-step-up-admin-password-123';
const userEmail = 'auth-step-up-user@localhost.test';
const userPassword = 'auth-step-up-user-password-123';

const getFreePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === 'string') {
          reject(new Error('Could not allocate a loopback port.'));
          return;
        }
        resolve(address.port);
      });
    });
  });

const waitFor = async (check, processHandle, label) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
    if (processHandle.exitCode !== null) {
      throw new Error(`${label} exited with status ${processHandle.exitCode}.`);
    }
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`${label} did not become ready.`);
};

const stopProcess = processHandle =>
  new Promise(resolve => {
    if (!processHandle || processHandle.exitCode !== null) {
      resolve();
      return;
    }
    const timeout = setTimeout(resolve, 5_000);
    processHandle.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    processHandle.kill('SIGTERM');
  });

const request = async (url, options = {}) => {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { data, response };
};

const expectStatus = (result, expected, label) => {
  if (result.response.status !== expected) {
    throw new Error(`${label} returned ${result.response.status}; expected ${expected}.`);
  }
};

async function main() {
  if (existsSync(runDir)) throw new Error(`Test directory already exists: ${runDir}`);
  mkdirSync(hooksDir, { recursive: true });

  const cachedBinary = await installPocketBase({
    destination: path.join(rootDir, '.tmp', 'pocketbase-cache', POCKETBASE_VERSION, 'pocketbase'),
  });
  copyFileSync(cachedBinary, binary);
  chmodSync(binary, 0o755);
  copyFileSync(
    path.join(rootDir, 'pb_hooks', 'auth_sign_in_methods.pb.js'),
    path.join(hooksDir, 'auth_sign_in_methods.pb.js')
  );
  upsertLocalPocketBaseSuperuser({
    pocketbaseBinary: binary,
    localDir: dataDir,
    email: adminEmail,
    password: adminPassword,
  });

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const stdout = openSync(path.join(runDir, 'pocketbase.stdout.log'), 'a');
  const stderr = openSync(path.join(runDir, 'pocketbase.stderr.log'), 'a');
  const processHandle = spawn(
    binary,
    [
      'serve',
      `--http=127.0.0.1:${port}`,
      `--dir=${path.join(dataDir, 'pb_data')}`,
      `--hooksDir=${hooksDir}`,
      '--automigrate=false',
    ],
    { cwd: dataDir, stdio: ['ignore', stdout, stderr] }
  );

  const oauthServer = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/token') {
      res.end(JSON.stringify({ access_token: 'local-test-token', token_type: 'Bearer' }));
    } else if (req.url === '/user') {
      res.end(
        JSON.stringify({
          id: 'oauth-local-discord-user',
          username: 'oauthlocaluser',
          email: 'oauth-local-user@localhost.test',
          verified: true,
        })
      );
    } else {
      res.writeHead(404).end();
    }
  });

  try {
    await new Promise(resolve => oauthServer.listen(0, '127.0.0.1', resolve));
    const oauthUrl = `http://127.0.0.1:${oauthServer.address().port}`;
    await waitFor(
      async () => {
        try {
          return (await fetch(`${baseUrl}/api/health`)).ok;
        } catch {
          return false;
        }
      },
      processHandle,
      'PocketBase'
    );
    await waitFor(
      async () => {
        const result = await request(`${baseUrl}/api/auth/step-up/password`, { method: 'POST' });
        return result.response.status === 401;
      },
      processHandle,
      'auth step-up hook'
    );

    let result = await request(`${baseUrl}/api/collections/_superusers/auth-with-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: adminEmail, password: adminPassword }),
    });
    expectStatus(result, 200, 'superuser authentication');
    const adminHeaders = {
      Authorization: `Bearer ${result.data.token}`,
      'Content-Type': 'application/json',
    };

    result = await request(`${baseUrl}/api/collections/import`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        collections: JSON.parse(
          readFileSync(path.join(rootDir, 'docs/pocketbase/collections.schema.json'), 'utf8')
        ),
        deleteMissing: true,
      }),
    });
    expectStatus(result, 204, 'schema import');

    result = await request(`${baseUrl}/api/collections/users`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        oauth2: {
          enabled: true,
          providers: [
            {
              name: 'discord',
              clientId: 'local-test-client',
              clientSecret: 'local-test-secret',
              authURL: `${oauthUrl}/authorize`,
              tokenURL: `${oauthUrl}/token`,
              userInfoURL: `${oauthUrl}/user`,
            },
          ],
        },
      }),
    });
    expectStatus(result, 200, 'local OAuth provider configuration');

    const oauthBody = {
      provider: 'discord',
      code: 'local-test-code',
      codeVerifier: 'local-test-verifier',
      redirectURL: `${baseUrl}/api/oauth2-redirect`,
    };
    let oauthRecordId;
    for (const operation of ['signup', 'sign-in']) {
      result = await request(`${baseUrl}/api/collections/users/auth-with-oauth2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(oauthBody),
      });
      expectStatus(result, 200, `OAuth ${operation} without createData`);
      if (!result.data.token || !result.data.record.verified)
        throw new Error('OAuth did not authenticate a verified user.');
      if (oauthRecordId && result.data.record.id !== oauthRecordId)
        throw new Error('OAuth sign-in created a duplicate user.');
      oauthRecordId = result.data.record.id;
    }
    const oauthToken = result.data.token;
    result = await request(`${baseUrl}/api/collections/users/auth-with-oauth2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${oauthToken}` },
      body: JSON.stringify(oauthBody),
    });
    expectStatus(result, 403, 'OAuth linking without createData');
    console.log(
      'OAuth signup and sign-in without createData passed; proofless linking remains blocked.'
    );

    result = await request(`${baseUrl}/api/collections/users/records`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        email: userEmail,
        password: userPassword,
        passwordConfirm: userPassword,
        username: 'authstepupuser',
        verified: true,
      }),
    });
    expectStatus(result, 200, 'test user creation');
    const userId = result.data.id;

    result = await request(`${baseUrl}/api/collections/users/auth-with-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: userEmail, password: userPassword }),
    });
    expectStatus(result, 200, 'test user authentication');
    const userHeaders = {
      Authorization: `Bearer ${result.data.token}`,
      'Content-Type': 'application/json',
    };

    result = await request(`${baseUrl}/api/collections/_externalAuths/records`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        collectionRef: '_pb_users_auth_',
        provider: 'google',
        providerId: 'auth-step-up-google-id',
        recordRef: userId,
      }),
    });
    expectStatus(result, 200, 'external identity fixture creation');
    const externalAuthId = result.data.id;

    result = await request(`${baseUrl}/api/collections/_externalAuths/records/${externalAuthId}`, {
      method: 'DELETE',
      headers: userHeaders,
    });
    expectStatus(result, 403, 'direct owner external identity deletion');

    result = await request(`${baseUrl}/api/auth/external-auths/google`, {
      method: 'DELETE',
      headers: userHeaders,
      body: JSON.stringify({}),
    });
    expectStatus(result, 403, 'stolen session unlink without proof');

    const linkProof = 'A'.repeat(43);
    result = await request(`${baseUrl}/api/auth/step-up/password`, {
      method: 'POST',
      headers: userHeaders,
      body: JSON.stringify({
        action: 'link',
        password: userPassword,
        proof: linkProof,
        targetProvider: 'google',
      }),
    });
    expectStatus(result, 204, 'password link proof');

    result = await request(
      `${baseUrl}/api/collections/auth_step_up_proofs/records?filter=${encodeURIComponent(`user='${userId}'`)}`,
      { headers: adminHeaders }
    );
    expectStatus(result, 200, 'proof inspection');
    const storedProof = result.data.items.find(item => item.action === 'link');
    if (
      !storedProof ||
      storedProof.proof_hash === linkProof ||
      storedProof.target_provider !== 'google' ||
      storedProof.verification_method !== 'password'
    ) {
      throw new Error('Stored proof was not hashed and bound to the requested scope.');
    }

    result = await request(`${baseUrl}/api/auth/external-auths/google`, {
      method: 'DELETE',
      headers: userHeaders,
      body: JSON.stringify({ proof: linkProof }),
    });
    expectStatus(result, 403, 'wrong-action proof');

    const unlinkProof = 'B'.repeat(43);
    result = await request(`${baseUrl}/api/auth/step-up/password`, {
      method: 'POST',
      headers: userHeaders,
      body: JSON.stringify({
        action: 'unlink',
        password: userPassword,
        proof: unlinkProof,
        targetProvider: 'google',
      }),
    });
    expectStatus(result, 204, 'password unlink proof');

    result = await request(`${baseUrl}/api/auth/external-auths/google`, {
      method: 'DELETE',
      headers: userHeaders,
      body: JSON.stringify({ proof: unlinkProof }),
    });
    expectStatus(result, 204, 'proof-authorized unlink');

    result = await request(`${baseUrl}/api/collections/_externalAuths/records`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        collectionRef: '_pb_users_auth_',
        provider: 'google',
        providerId: 'auth-step-up-google-id',
        recordRef: userId,
      }),
    });
    expectStatus(result, 200, 'replay fixture creation');
    result = await request(`${baseUrl}/api/auth/external-auths/google`, {
      method: 'DELETE',
      headers: userHeaders,
      body: JSON.stringify({ proof: unlinkProof }),
    });
    expectStatus(result, 403, 'replayed unlink proof');

    const failureStatuses = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      result = await request(`${baseUrl}/api/auth/step-up/password`, {
        method: 'POST',
        headers: userHeaders,
        body: JSON.stringify({
          action: 'unlink',
          password: 'wrong-password',
          proof: 'C'.repeat(43),
          targetProvider: 'google',
        }),
      });
      failureStatuses.push(result.response.status);
    }
    if (failureStatuses.join(',') !== '400,400,400,400,400,429') {
      throw new Error(`Unexpected password throttle statuses: ${failureStatuses.join(',')}`);
    }

    console.log(
      'Auth step-up passed: locked collections, hashed scope, missing/wrong/replayed proof, and 5-per-10-minute password throttle.'
    );
  } finally {
    await new Promise(resolve => oauthServer.close(resolve));
    await stopProcess(processHandle);
    closeSync(stdout);
    closeSync(stderr);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(`PocketBase logs: ${path.relative(rootDir, runDir)}`);
  process.exitCode = 1;
});
