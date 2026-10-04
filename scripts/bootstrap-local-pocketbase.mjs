#!/usr/bin/env node

import PocketBase from 'pocketbase';
import { seedExampleLibrary } from './seed-example-library.mjs';

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { upsertLocalPocketBaseSuperuser } from './upsert-local-pocketbase-superuser.mjs';
import { syncLocalPocketBaseHooks } from './sync-local-pocketbase-hooks.mjs';

const rootDir = process.cwd();
const localDir = path.resolve(rootDir, process.env.LOCAL_POCKETBASE_DIR || 'local-pb-db');
const pocketbaseBinary = path.join(localDir, 'pocketbase');
const localSchemaPath = path.join(localDir, 'pb_schema.json');
const committedSchemaPath = path.join(rootDir, 'docs/pocketbase/collections.schema.json');

const defaultLocalUrl = 'http://localhost:8090';
const defaultAdminEmail = 'admin@localhost.dev';
const defaultAdminPassword = 'admin123456';
const defaultTestUserEmail = 'sarah-local@example.test';
const defaultTestUserPassword = 'local-test-password-123';
const defaultPocketBasePort = '8090';
const defaultPocketBaseOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002',
  'http://127.0.0.1:5173',
];

const args = new Set(process.argv.slice(2));
const shouldSeedExamples = args.has('--seed-examples');
const shouldSeed = args.has('--seed') || shouldSeedExamples;
const shouldKeepAlive = !args.has('--no-keepalive');
const originalEnvKeys = new Set(Object.keys(process.env));

function loadDotEnv(filePath, { override = false } = {}) {
  if (!existsSync(filePath)) return;

  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (originalEnvKeys.has(key)) continue;
    if (!override && process.env[key] !== undefined) continue;

    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

function assertLocalUrl(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL. Received: ${value}`);
  }

  const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (!localHosts.has(url.hostname)) {
    throw new Error(`${name} must point to localhost. Received: ${value}`);
  }
}

function normalizeLocalUrl(value, name) {
  assertLocalUrl(value, name);

  const url = new URL(value);
  if (!url.port) {
    url.port = defaultPocketBasePort;
  }

  url.pathname = '';
  url.search = '';
  url.hash = '';

  return url.toString().replace(/\/$/, '');
}

function getPocketBaseOrigins() {
  const configuredOrigins = process.env.LOCAL_POCKETBASE_ALLOWED_ORIGINS;
  if (configuredOrigins) {
    return configuredOrigins
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean)
      .join(',');
  }

  return defaultPocketBaseOrigins.join(',');
}

function assertSafeEnvironment(localUrl) {
  assertLocalUrl(localUrl, 'LOCAL_POCKETBASE_URL');

  const viteUrl = process.env.VITE_POCKETBASE_URL;
  if (!viteUrl) return;

  if (viteUrl.includes('data.organizedglitter.app')) {
    throw new Error(
      'VITE_POCKETBASE_URL points at production. Run this with local PocketBase env values only.'
    );
  }

  assertLocalUrl(viteUrl, 'VITE_POCKETBASE_URL');
}

function ensureLocalFiles() {
  if (!existsSync(pocketbaseBinary)) {
    throw new Error(
      [
        'Missing local PocketBase binary.',
        `Expected: ${path.relative(rootDir, pocketbaseBinary)}`,
        'Download the matching PocketBase release and place the executable there.',
      ].join('\n')
    );
  }

  if (!existsSync(localSchemaPath) && !existsSync(committedSchemaPath)) {
    throw new Error(
      [
        'Missing PocketBase schema export.',
        `Expected one of:`,
        `- ${path.relative(rootDir, localSchemaPath)}`,
        `- ${path.relative(rootDir, committedSchemaPath)}`,
      ].join('\n')
    );
  }

  mkdirSync(localDir, { recursive: true });
}

async function request(url, options = {}) {
  const startedAt = Date.now();
  let lastFetchError = null;
  let lastTransientStatus = null;

  while (Date.now() - startedAt < 15000) {
    let response;
    try {
      response = await fetch(url, options);
    } catch (error) {
      lastFetchError = error;
      await new Promise(resolve => setTimeout(resolve, 250));
      continue;
    }

    if (response.ok) return response;

    if (![502, 503, 504].includes(response.status)) {
      const body = await response.text().catch(() => '');
      throw new Error(`${options.method || 'GET'} ${url} failed with ${response.status}: ${body}`);
    }

    lastTransientStatus = response.status;
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  throw (
    lastFetchError ||
    new Error(`${options.method || 'GET'} ${url} failed with ${lastTransientStatus} after retries.`)
  );
}

async function isServerReady(localUrl) {
  try {
    const response = await fetch(`${localUrl}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(localUrl) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    if (await isServerReady(localUrl)) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  throw new Error(`PocketBase did not become ready at ${localUrl}`);
}

function upsertSuperuser(email, password) {
  upsertLocalPocketBaseSuperuser({
    pocketbaseBinary,
    localDir,
    email,
    password,
  });
}

function startPocketBase(localUrl) {
  const url = new URL(localUrl);
  const httpAddress = `${url.hostname}:${url.port || defaultPocketBasePort}`;

  return spawn(
    pocketbaseBinary,
    ['serve', `--http=${httpAddress}`, `--origins=${getPocketBaseOrigins()}`],
    {
      cwd: localDir,
      stdio: ['ignore', 'inherit', 'inherit'],
    }
  );
}

async function authenticateSuperuser(localUrl, email, password) {
  const response = await request(`${localUrl}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password }),
  });

  const data = await response.json();
  if (!data.token) {
    throw new Error('PocketBase did not return a superuser auth token.');
  }

  return data.token;
}

async function importSchema(localUrl, token) {
  const schemaPath = existsSync(localSchemaPath) ? localSchemaPath : committedSchemaPath;
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));

  if (!Array.isArray(schema)) {
    throw new Error(`${path.relative(rootDir, schemaPath)} must be a collections array.`);
  }

  await request(`${localUrl}/api/collections/import`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ collections: schema, deleteMissing: true }),
  });

  console.log(`Imported schema from ${path.relative(rootDir, schemaPath)}.`);
}

async function getFirstRecord(localUrl, token, collection, filter) {
  const params = new URLSearchParams({ page: '1', perPage: '1', filter });
  const response = await request(`${localUrl}/api/collections/${collection}/records?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  return data.items?.[0] || null;
}

async function upsertRecord(localUrl, token, collection, id, data) {
  const existing = await getFirstRecord(localUrl, token, collection, `id = "${id}"`);
  const method = existing ? 'PATCH' : 'POST';
  const url = existing
    ? `${localUrl}/api/collections/${collection}/records/${id}`
    : `${localUrl}/api/collections/${collection}/records`;

  const response = await request(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(existing ? data : { id, ...data }),
  });

  return response.json();
}

async function updateRecord(localUrl, token, collection, id, data) {
  const response = await request(`${localUrl}/api/collections/${collection}/records/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  return response.json();
}

async function upsertSeedUser(localUrl, token, id, data) {
  const existing = await getFirstRecord(localUrl, token, 'users', `id = "${id}"`);
  if (!existing) {
    return upsertRecord(localUrl, token, 'users', id, data);
  }

  const profileData = Object.fromEntries(
    Object.entries(data).filter(([key]) => key !== 'password' && key !== 'passwordConfirm')
  );
  return upsertRecord(localUrl, token, 'users', id, profileData);
}

async function seedFakeData(localUrl, token) {
  const userId = 'localuser000001';
  const today = new Date().toISOString().slice(0, 10);

  await upsertSeedUser(localUrl, token, userId, {
    email: process.env.LOCAL_POCKETBASE_TEST_USER_EMAIL || defaultTestUserEmail,
    password: process.env.LOCAL_POCKETBASE_TEST_USER_PASSWORD || defaultTestUserPassword,
    passwordConfirm: process.env.LOCAL_POCKETBASE_TEST_USER_PASSWORD || defaultTestUserPassword,
    username: 'sarah-local',
    verified: true,
    emailVisibility: false,
    beta_tester: true,
    timezone: 'America/New_York',
    theme_preference: 'system',
    coloring_walkthrough_seen: true,
  });

  await upsertSeedUser(localUrl, token, 'localuser000002', {
    email: 'other-local@example.test',
    password: process.env.LOCAL_POCKETBASE_TEST_USER_PASSWORD || defaultTestUserPassword,
    passwordConfirm: process.env.LOCAL_POCKETBASE_TEST_USER_PASSWORD || defaultTestUserPassword,
    username: 'other-local',
    verified: true,
    emailVisibility: false,
    beta_tester: true,
    timezone: 'America/New_York',
    theme_preference: 'system',
    coloring_walkthrough_seen: true,
  });

  await upsertRecord(localUrl, token, 'user_dashboard_settings', 'localdashset001', {
    user: userId,
    vertical_enabled: { diamond_painting: true, coloring_books: true },
  });

  await upsertRecord(localUrl, token, 'companies', 'localcompany001', {
    user: userId,
    name: 'Local Sparkle Studio',
    website_url: 'https://example.test/local-sparkle',
  });

  await upsertRecord(localUrl, token, 'artists', 'localartist0001', {
    user: userId,
    name: 'Avery Example',
  });

  await upsertRecord(localUrl, token, 'tags', 'localtag0000001', {
    user: userId,
    name: 'Local Favorite',
    slug: 'local-favorite',
    color: '#8b5cf6',
  });

  const projects = [
    ['localproject001', 'Local Wishlist Kit', 'wishlist'],
    ['localproject002', 'Local Stash Kit', 'stash'],
    ['localproject003', 'Local Active Kit', 'progress'],
    ['localproject004', 'Local Completed Kit', 'completed'],
  ];

  for (const [id, title, status] of projects) {
    await upsertRecord(localUrl, token, 'projects', id, {
      title,
      user: userId,
      company: 'localcompany001',
      artist: 'localartist0001',
      status,
      kit_category: 'full',
      drill_shape: 'square',
      title_sort: title.toLowerCase(),
      company_name_sort: 'local sparkle studio',
      artist_name_sort: 'avery example',
      general_notes: `<p>Fake local ${status} project.</p>`,
    });
  }

  await upsertRecord(localUrl, token, 'project_tags', 'localprojtag001', {
    project: 'localproject003',
    tag: 'localtag0000001',
  });

  await upsertRecord(localUrl, token, 'progress_notes', 'localpnote00001', {
    project: 'localproject003',
    date: today,
    content: '<p>Fake local progress note for app testing.</p>',
  });

  await upsertRecord(localUrl, token, 'book_publishers', 'localpub0000001', {
    user: userId,
    name: 'Local Page Press',
    website_url: 'https://example.test/local-page-press',
  });

  await upsertRecord(localUrl, token, 'book_illustrators', 'localillus00001', {
    user: userId,
    name: 'Casey Example',
  });

  await upsertRecord(localUrl, token, 'coloring_mediums', 'localmedium0001', {
    user: userId,
    name: 'Local Colored Pencils',
    type: 'colored_pencil',
    brand: 'Example Art',
    color_count: 48,
  });

  await upsertRecord(localUrl, token, 'coloring_mediums', 'foreignmedium01', {
    user: 'localuser000002',
    name: 'Foreign Local Marker',
    type: 'other',
    brand: 'Other Local User',
    color_count: 12,
  });

  await upsertRecord(localUrl, token, 'coloring_tags', 'localctag000001', {
    user: userId,
    name: 'Relaxing',
    slug: 'relaxing',
    color: '#14b8a6',
  });

  await upsertRecord(localUrl, token, 'coloring_books', 'localcbook00001', {
    user: userId,
    title: 'Local Garden Coloring Book',
    series: 'Local Test Library',
    theme: 'Botanical',
    is_mystery: true,
    status: 'in_progress',
    total_pages: 40,
    publisher: 'localpub0000001',
    illustrator: 'localillus00001',
    completed_pages: 1,
    completion_percentage: 3,
    last_activity_at: today,
    book_format: 'paperback',
    language: 'english',
    notes: 'Fake local coloring book.',
  });

  const localColoringPage = await getFirstRecord(
    localUrl,
    token,
    'coloring_pages',
    'book = "localcbook00001" && page_number = 1'
  );

  if (!localColoringPage) {
    throw new Error('Expected local coloring book seed to auto-generate page 1.');
  }

  await updateRecord(localUrl, token, 'coloring_pages', localColoringPage.id, {
    status: 'in_progress',
    revealed_subject: 'Local flower page',
    revealed_at: today,
    started_at: today,
  });

  await upsertRecord(localUrl, token, 'coloring_book_tags', 'localcbtag00001', {
    book: 'localcbook00001',
    tag: 'localctag000001',
  });

  await upsertRecord(localUrl, token, 'coloring_page_progress_notes', 'localcpnote0001', {
    user: userId,
    page: localColoringPage.id,
    date: today,
    content: '<p>Fake local coloring note.</p>',
  });

  await upsertRecord(localUrl, token, 'randomizer_spins', 'localspin000001', {
    user: userId,
    project: 'localproject003',
    project_title: 'Local Active Kit',
    project_company: 'Local Sparkle Studio',
    project_artist: 'Avery Example',
    spun_at: today,
    selected_count: 2,
    selected_projects: [
      { id: 'localproject002', title: 'Local Stash Kit' },
      { id: 'localproject003', title: 'Local Active Kit' },
    ],
    metadata: { source: 'local-bootstrap', fake: true },
  });

  console.log(
    [
      'Seeded fake local records.',
      `Test user: ${process.env.LOCAL_POCKETBASE_TEST_USER_EMAIL || defaultTestUserEmail}`,
      `Fixture project: localproject003`,
      `Fixture coloring book: localcbook00001`,
      `Fixture coloring page: ${localColoringPage.id}`,
    ].join('\n')
  );
}

async function main() {
  let serverProcess = null;

  loadDotEnv(path.join(rootDir, '.env'));
  loadDotEnv(path.join(rootDir, '.env.local'), { override: true });

  const localUrl = normalizeLocalUrl(
    process.env.LOCAL_POCKETBASE_URL || defaultLocalUrl,
    'LOCAL_POCKETBASE_URL'
  );
  const adminEmail = process.env.LOCAL_POCKETBASE_ADMIN_EMAIL || defaultAdminEmail;
  const adminPassword = process.env.LOCAL_POCKETBASE_ADMIN_PASSWORD || defaultAdminPassword;

  assertSafeEnvironment(localUrl);
  ensureLocalFiles();
  syncLocalPocketBaseHooks(rootDir, localDir);

  try {
    if (await isServerReady(localUrl)) {
      console.log(`Using existing PocketBase server at ${localUrl}.`);
    } else {
      upsertSuperuser(adminEmail, adminPassword);
      serverProcess = startPocketBase(localUrl);
      await waitForServer(localUrl);
    }

    const token = await authenticateSuperuser(localUrl, adminEmail, adminPassword);
    await importSchema(localUrl, token);

    if (shouldSeed) {
      await seedFakeData(localUrl, token);
      if (shouldSeedExamples) {
        const client = new PocketBase(localUrl);
        client.authStore.save(token);
        const result = await seedExampleLibrary(client, 'localuser000001');
        console.log(
          `Seeded example library: ${result.projects} projects and ${result.books} books.`
        );
      }
    }

    console.log(`Local PocketBase is ready at ${localUrl}.`);

    if (!serverProcess || !shouldKeepAlive) {
      return;
    }

    console.log('PocketBase is running. Press Ctrl+C to stop it.');
    await new Promise((resolve, reject) => {
      serverProcess.on('exit', code => {
        if (code === 0 || code === null) resolve();
        else reject(new Error(`PocketBase exited with code ${code}`));
      });
    });
  } finally {
    if (serverProcess && !shouldKeepAlive && !serverProcess.killed) {
      serverProcess.kill('SIGTERM');
    }
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
