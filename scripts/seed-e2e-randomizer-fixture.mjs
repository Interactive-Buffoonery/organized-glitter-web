/**
 * Seed durable randomizer wheel-key fixtures on the E2E test account.
 *
 * Creates (idempotently, matched by stable title) eight diamond projects:
 *   "E2E Fixture Randomizer 01" ... "E2E Fixture Randomizer 08"
 * all in status `progress` so the default diamond pool includes them.
 *
 * Mobile randomizer switches to numbered wedges + the "Open wheel key"
 * control when more than six items are selected. Hosted a11y coverage for
 * that drawer needs at least seven progress projects; these eight fixtures
 * make that deterministic without relying on incidental account data.
 *
 * Usage:
 *   set -a; . ./.env.e2e; set +a
 *   export VITE_POCKETBASE_URL=https://data.organizedglitter.app
 *   node scripts/seed-e2e-randomizer-fixture.mjs
 *
 * Prints:
 *   E2E_RANDOMIZER_PROJECT_IDS=id1,id2,...
 *
 * Re-running is safe and returns the same ids. The seed never renames or
 * deletes non-fixture projects.
 */

import { pathToFileURL } from 'node:url';

import PocketBase from 'pocketbase';

const FIXTURE_COUNT = 8;
const FIXTURE_TITLE_PREFIX = 'E2E Fixture Randomizer';

/**
 * Seed fixtures one at a time so a single create/update failure does not abort
 * the rest of the batch. Re-runs can then fill in the missing titles. Reject
 * any incomplete batch so callers never treat fewer than the promised fixtures
 * as success.
 */
export const collectFixtureProjects = async (count, findOrCreate, logError = console.error) => {
  const projects = [];
  let failures = 0;
  for (let index = 1; index <= count; index += 1) {
    try {
      projects.push(await findOrCreate(index));
    } catch (err) {
      failures += 1;
      logError({ reason: 'fixture_seed_failed', index, error: err });
    }
  }
  if (failures > 0) {
    throw new Error(
      `Fixture seeding incomplete: ${projects.length} succeeded, ${failures} failed; expected all ${count} fixtures.`
    );
  }
  return projects;
};

const fixtureTitle = index => `${FIXTURE_TITLE_PREFIX} ${String(index).padStart(2, '0')}`;

const runSeed = async () => {
  const pocketBaseUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    console.error('Missing E2E_TEST_EMAIL or E2E_TEST_PASSWORD. Source .env.e2e first.');
    process.exit(1);
  }

  const pb = new PocketBase(pocketBaseUrl);
  await pb.collection('users').authWithPassword(email, password);
  const userId = pb.authStore.record?.id;
  if (!userId) {
    console.error('PocketBase did not return an authenticated E2E user.');
    process.exit(1);
  }

  const findOrCreateFixtureProject = async index => {
    const title = fixtureTitle(index);
    const existing = await pb.collection('projects').getFullList({
      filter: pb.filter('user = {:u} && title = {:t}', { u: userId, t: title }),
    });
    if (existing.length > 0) {
      const record = existing[0];
      if (record.status !== 'progress') {
        return pb.collection('projects').update(record.id, { status: 'progress' });
      }
      return record;
    }

    return pb.collection('projects').create({
      user: userId,
      title,
      status: 'progress',
      kit_category: 'full',
      drill_shape: 'round',
      general_notes: '<p>E2E randomizer wheel-key fixture. Safe to keep.</p>',
    });
  };

  const projects = await collectFixtureProjects(FIXTURE_COUNT, findOrCreateFixtureProject);
  const ids = projects.map(project => project.id);
  console.log(`E2E_RANDOMIZER_PROJECT_IDS=${ids.join(',')}`);
  console.error(
    `Seeded: ${projects.length} "${FIXTURE_TITLE_PREFIX} NN" progress projects ` +
      `(${ids.join(', ')}).`
  );
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runSeed();
}
