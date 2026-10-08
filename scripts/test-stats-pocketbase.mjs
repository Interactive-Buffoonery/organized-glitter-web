import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

import PocketBase from 'pocketbase';

import { installPocketBase } from './install-pocketbase.mjs';

const root = process.cwd();
const directory = mkdtempSync(path.join(tmpdir(), 'og-stats-pb-'));
const dataDir = path.join(directory, 'data');
const hooksDir = path.join(directory, 'hooks');
const migrationsDir = path.join(directory, 'migrations');
mkdirSync(hooksDir);
mkdirSync(migrationsDir);
copyFileSync(path.join(root, 'pb_hooks/stats.pb.js'), path.join(hooksDir, 'stats.pb.js'));

const binary = await installPocketBase({
  destination: path.join(root, '.tmp/test-tools/pocketbase'),
});
const socket = net.createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const url = `http://127.0.0.1:${port}`;
const password = 'stats-smoke-password-123';
const adminEmail = 'stats-admin@example.test';
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
  { stdio: ['ignore', 'pipe', 'pipe'] }
);
server.stdout.on('data', chunk => (output += chunk.toString()));
server.stderr.on('data', chunk => (output += chunk.toString()));

async function waitForPocketBase(admin) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`PocketBase stopped: ${output}`);
    try {
      await admin.health.check();
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  throw new Error(`PocketBase did not become ready: ${output}`);
}

async function createUser(admin, suffix) {
  return admin.collection('users').create({
    email: `stats-${suffix}@example.test`,
    username: `stats-${suffix}`,
    password,
    passwordConfirm: password,
    verified: true,
  });
}

async function createProject(admin, user, values) {
  return admin.collection('projects').create({
    user: user.id,
    title: values.title,
    status: values.status,
    kit_category: 'full',
    date_purchased: values.datePurchased ?? '',
    date_received: values.dateReceived ?? '',
    date_started: values.dateStarted ?? '',
    date_completed: values.dateCompleted ?? '',
  });
}

async function createColoringBook(admin, user, values) {
  return admin.collection('coloring_books').create({
    user: user.id,
    title: values.title,
    status: values.status ?? 'in_progress',
    total_pages: values.totalPages,
    completed_pages: values.completedPages,
    completion_percentage: values.completionPercentage,
    date_purchased: values.datePurchased ?? '',
    date_started: values.dateStarted ?? '',
  });
}

async function createColoringPage(admin, book, values) {
  return admin.collection('coloring_pages').create({
    book: book.id,
    page_number: values.pageNumber,
    status: values.status,
    started_at: values.startedAt ?? '',
    completed_at: values.completedAt ?? '',
  });
}

async function getStats(client, endpoint, query = '') {
  const response = await fetch(`${url}${endpoint}${query}`, {
    headers: { Authorization: client.authStore.token },
  });
  const responseBody = await response.text();
  assert.equal(
    response.status,
    200,
    `${endpoint} returned ${response.status}: ${responseBody}\n${output.split('\n').slice(-80).join('\n')}`
  );
  return JSON.parse(responseBody);
}

try {
  const admin = new PocketBase(url);
  await waitForPocketBase(admin);
  await admin.collection('_superusers').authWithPassword(adminEmail, password);
  const schema = JSON.parse(
    readFileSync(path.join(root, 'docs/pocketbase/collections.schema.json'), 'utf8')
  );
  await admin.collections.import(schema, false);

  const firstUser = await createUser(admin, 'first');
  const secondUser = await createUser(admin, 'second');

  const firstCompletedProject = await createProject(admin, firstUser, {
    title: 'First completed project',
    status: 'completed',
    datePurchased: '2025-12-27 00:00:00.000Z',
    dateReceived: '2025-12-29 00:00:00.000Z',
    dateStarted: '2026-01-01 00:00:00.000Z',
    dateCompleted: '2026-01-10 00:00:00.000Z',
  });
  await createProject(admin, firstUser, {
    title: 'First wishlist project',
    status: 'wishlist',
  });
  await createProject(admin, firstUser, {
    title: 'First active project',
    status: 'progress',
    dateStarted: '2026-02-01 00:00:00.000Z',
  });

  await createProject(admin, secondUser, {
    title: 'Second completed project one',
    status: 'completed',
    datePurchased: '2026-02-25 00:00:00.000Z',
    dateReceived: '2026-02-27 00:00:00.000Z',
    dateStarted: '2026-03-01 00:00:00.000Z',
    dateCompleted: '2026-03-05 00:00:00.000Z',
  });
  await createProject(admin, secondUser, {
    title: 'Second completed project two',
    status: 'completed',
    dateStarted: '2026-04-01 00:00:00.000Z',
    dateCompleted: '2026-04-08 00:00:00.000Z',
  });

  const noteImage = new File(
    [
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZbJkAAAAASUVORK5CYII=',
        'base64'
      ),
    ],
    'progress.png',
    { type: 'image/png' }
  );
  await admin.collection('progress_notes').create({
    project: firstCompletedProject.id,
    content: 'First user progress note',
    date: '2026-01-05 00:00:00.000Z',
    image: noteImage,
  });

  const firstBook = await createColoringBook(admin, firstUser, {
    title: 'First coloring book',
    totalPages: 2,
    completedPages: 1,
    completionPercentage: 50,
    datePurchased: '2026-01-01 00:00:00.000Z',
    dateStarted: '2026-01-06 00:00:00.000Z',
  });
  const firstCompletedPage = await createColoringPage(admin, firstBook, {
    pageNumber: 1,
    status: 'completed',
    startedAt: '2026-01-07 00:00:00.000Z',
    completedAt: '2026-01-11 00:00:00.000Z',
  });
  await createColoringPage(admin, firstBook, {
    pageNumber: 2,
    status: 'not_started',
  });

  const secondBookOne = await createColoringBook(admin, secondUser, {
    title: 'Second coloring book one',
    totalPages: 1,
    completedPages: 1,
    completionPercentage: 100,
    datePurchased: '2026-02-01 00:00:00.000Z',
    dateStarted: '2026-02-03 00:00:00.000Z',
  });
  await createColoringPage(admin, secondBookOne, {
    pageNumber: 1,
    status: 'completed',
    startedAt: '2026-02-04 00:00:00.000Z',
    completedAt: '2026-02-06 00:00:00.000Z',
  });
  const secondBookTwo = await createColoringBook(admin, secondUser, {
    title: 'Second coloring book two',
    totalPages: 1,
    completedPages: 1,
    completionPercentage: 100,
    datePurchased: '2026-03-01 00:00:00.000Z',
    dateStarted: '2026-03-04 00:00:00.000Z',
  });
  await createColoringPage(admin, secondBookTwo, {
    pageNumber: 1,
    status: 'completed',
    startedAt: '2026-03-05 00:00:00.000Z',
    completedAt: '2026-03-08 00:00:00.000Z',
  });

  const firstClient = new PocketBase(url);
  const secondClient = new PocketBase(url);
  await firstClient.collection('users').authWithPassword(firstUser.email, password);
  await secondClient.collection('users').authWithPassword(secondUser.email, password);

  const firstSummary = await getStats(firstClient, '/api/stats/summary', '?year=2026');
  assert.equal(firstSummary.metrics.totalKits, 3);
  assert.equal(firstSummary.metrics.completedThisYear, 1);
  assert.equal(firstSummary.metrics.allTimeCompleted, 1);
  assert.equal(firstSummary.statusBreakdown.completed, 1);
  assert.equal(firstSummary.statusBreakdown.wishlist, 1);
  assert.equal(firstSummary.statusBreakdown.progress, 1);

  const secondSummary = await getStats(secondClient, '/api/stats/summary', '?year=2026');
  assert.equal(secondSummary.metrics.totalKits, 2);
  assert.equal(secondSummary.metrics.completedThisYear, 2);
  assert.equal(secondSummary.metrics.allTimeCompleted, 2);
  assert.equal(secondSummary.statusBreakdown.completed, 2);
  assert.equal(secondSummary.statusBreakdown.wishlist, 0);
  assert.equal(secondSummary.statusBreakdown.progress, 0);

  const firstCompletions = await getStats(firstClient, '/api/stats/completions', '?year=2026');
  assert.equal(firstCompletions.total, 1);
  assert.equal(firstCompletions.months[0].count, 1);
  assert.equal(firstCompletions.months[0].averageCompletionDays, 9);

  const firstCompletionTimes = await getStats(firstClient, '/api/stats/completion-times');
  assert.equal(firstCompletionTimes.averageCompletionDays, 9);
  assert.equal(firstCompletionTimes.averageStashDwellDays, 3);
  assert.equal(firstCompletionTimes.averageTimeToStartDays, 5);
  assert.equal(firstCompletionTimes.fastestCompletion.id, firstCompletedProject.id);
  assert.equal(firstCompletionTimes.fastestCompletion.title, 'First completed project');
  assert.match(firstCompletionTimes.fastestCompletion.dateStarted, /^2026-01-01/);
  assert.match(firstCompletionTimes.fastestCompletion.dateCompleted, /^2026-01-10/);

  const firstMonthReview = await getStats(
    firstClient,
    '/api/stats/month-in-review',
    '?year=2026&month=1'
  );
  assert.equal(firstMonthReview.completedKits.length, 1);
  assert.equal(firstMonthReview.completedKits[0].company, null);
  assert.equal(firstMonthReview.completedKits[0].artist, null);
  assert.equal(firstMonthReview.progressNotes.length, 1);
  assert.equal(firstMonthReview.progressNotes[0].projectId, firstCompletedProject.id);
  assert.equal(firstMonthReview.progressNotes[0].projectTitle, 'First completed project');
  assert.equal(firstMonthReview.progressNotes[0].hasImage, true);

  const currentDate = new Date(firstCompletedProject.created);
  const currentMonthReview = await getStats(
    firstClient,
    '/api/stats/month-in-review',
    `?year=${currentDate.getUTCFullYear()}&month=${currentDate.getUTCMonth() + 1}`
  );
  const currentCompletedProject = currentMonthReview.newAdditions.find(
    project => project.id === firstCompletedProject.id
  );
  assert.ok(currentCompletedProject);
  assert.equal(currentCompletedProject.company, null);
  assert.equal(currentCompletedProject.artist, null);

  const firstColoringSummary = await getStats(
    firstClient,
    '/api/stats/coloring/summary',
    '?year=2026'
  );
  assert.equal(firstColoringSummary.metrics.totalBooks, 1);
  assert.equal(firstColoringSummary.metrics.completedPagesThisYear, 1);
  assert.equal(firstColoringSummary.metrics.allTimeCompletedPages, 1);
  assert.equal(firstColoringSummary.pageStatusBreakdown.completed, 1);
  assert.equal(firstColoringSummary.pageStatusBreakdown.not_started, 1);

  const secondColoringSummary = await getStats(
    secondClient,
    '/api/stats/coloring/summary',
    '?year=2026'
  );
  assert.equal(secondColoringSummary.metrics.totalBooks, 2);
  assert.equal(secondColoringSummary.metrics.completedPagesThisYear, 2);
  assert.equal(secondColoringSummary.metrics.allTimeCompletedPages, 2);

  const firstColoringCompletions = await getStats(
    firstClient,
    '/api/stats/coloring/completions',
    '?year=2026'
  );
  assert.equal(firstColoringCompletions.total, 1);
  assert.equal(firstColoringCompletions.months[0].count, 1);
  assert.equal(firstColoringCompletions.months[0].averageCompletionDays, 4);

  const firstColoringCompletionTimes = await getStats(
    firstClient,
    '/api/stats/coloring/completion-times'
  );
  assert.equal(firstColoringCompletionTimes.averagePageCompletionDays, 4);
  assert.equal(firstColoringCompletionTimes.averageBookDwellDays, 5);
  assert.equal(firstColoringCompletionTimes.fastestPageCompletion.id, firstCompletedPage.id);
  assert.equal(firstColoringCompletionTimes.fastestPageCompletion.bookId, firstBook.id);
  assert.equal(firstColoringCompletionTimes.fastestPageCompletion.bookTitle, 'First coloring book');
  assert.equal(firstColoringCompletionTimes.fastestPageCompletion.pageNumber, 1);
  assert.match(firstColoringCompletionTimes.fastestPageCompletion.startedAt, /^2026-01-07/);
  assert.match(firstColoringCompletionTimes.fastestPageCompletion.completedAt, /^2026-01-11/);

  const firstColoringCollection = await getStats(firstClient, '/api/stats/coloring/collection');
  assert.deepEqual(firstColoringCollection.completionBuckets, [
    { key: 'not_started', label: 'Not started', count: 0 },
    { key: 'started', label: '1-49%', count: 0 },
    { key: 'halfway', label: '50-99%', count: 1 },
    { key: 'completed', label: 'Completed', count: 0 },
  ]);

  const usedArtist = await admin
    .collection('artists')
    .create({ user: firstUser.id, name: 'Counted artist' });
  const unusedArtist = await admin
    .collection('artists')
    .create({ user: firstUser.id, name: 'Unused artist' });
  const otherUserArtist = await admin
    .collection('artists')
    .create({ user: secondUser.id, name: 'Other user artist' });
  for (const title of ['Artist kit one', 'Artist kit two']) {
    const project = await createProject(admin, firstUser, { title, status: 'wishlist' });
    await admin.collection('projects').update(project.id, { artist: usedArtist.id });
  }
  const crossUserProject = await createProject(admin, secondUser, {
    title: 'Cross user artist kit',
    status: 'wishlist',
  });
  await admin.collection('projects').update(crossUserProject.id, { artist: usedArtist.id });
  const secondUserProject = await createProject(admin, secondUser, {
    title: 'Second user artist kit',
    status: 'wishlist',
  });
  await admin.collection('projects').update(secondUserProject.id, { artist: otherUserArtist.id });

  const firstArtistCounts = await getStats(firstClient, '/api/stats/artist-project-counts');
  assert.deepEqual(firstArtistCounts, { counts: { [usedArtist.id]: 2 } });
  assert.equal(firstArtistCounts.counts[unusedArtist.id], undefined);
  const secondArtistCounts = await getStats(secondClient, '/api/stats/artist-project-counts');
  assert.deepEqual(secondArtistCounts, { counts: { [otherUserArtist.id]: 1 } });

  console.log('PocketBase stats routes: seeded aliases and user isolation passed');
} finally {
  await new Promise(resolve => {
    if (server.exitCode !== null || server.signalCode !== null) return resolve();
    server.once('exit', resolve);
    server.kill('SIGTERM');
  });
  rmSync(directory, { recursive: true, force: true });
}
