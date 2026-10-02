/**
 * Foreign coloring-medium rejection on page update (#105 / commit 6d532698).
 *
 * The coloring_pages.mediums relation must reject any medium the requester does
 * not own. The committed fix is a PocketBase request hook
 * (pb_hooks/coloring_medium_ownership.pb.js) that throws BadRequestError when a
 * newly introduced medium id is not owned by the authenticated user.
 *
 * This spec drives the contract end-to-end against the real backend through the
 * authenticated PocketBase client (the medium picker UI never surfaces another
 * user's mediums, so there is no UI path to exercise). It creates a genuinely
 * foreign-owned medium by signing up a transient second user, then attempts to
 * attach that medium to a page owned by the E2E account and asserts the write is
 * rejected with HTTP 400 and a `mediums` field error.
 *
 * Backend caveat (verified empirically): on the prod backend the rejection is
 * returned by PocketBase's native relation-field validation
 * (`validation_invalid_value`), which fires before the hook can run. The hook's
 * own BadRequestError message therefore cannot be isolated from the outside, so
 * this spec asserts the observable security contract (400 + `mediums` error),
 * NOT the hook's specific code/message. The "own medium accepted" assertion is a
 * positive control: it proves medium writes succeed in general, so the foreign
 * rejection is meaningful and not an unrelated failure.
 */

import { expect, test } from '@playwright/test';
import PocketBase from 'pocketbase';
import { randomUUID } from 'node:crypto';

import { assertLocalE2ETargets } from '../fixtures/local-safety';

const pocketBaseUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

interface RecordWithId {
  id: string;
}

const authedPrimaryClient = async () => {
  if (!email || !password) {
    throw new Error('Missing E2E_TEST_EMAIL or E2E_TEST_PASSWORD for foreign-medium E2E test.');
  }
  const pb = new PocketBase(pocketBaseUrl);
  await pb.collection('users').authWithPassword(email, password);
  if (!pb.authStore.record?.id) {
    throw new Error('PocketBase did not return an authenticated E2E user.');
  }
  return pb;
};

test.describe('Foreign coloring-medium rejection on page update', () => {
  let pb: PocketBase;
  let runId: string;
  let bookId: string | null = null;
  let pageId: string | null = null;
  let ownMediumId: string | null = null;

  // Transient second user that owns the foreign medium.
  let secondUserPb: PocketBase;
  let secondUserId: string | null = null;
  let foreignMediumId: string | null = null;

  test.beforeAll(async () => {
    assertLocalE2ETargets({
      appUrl,
      pocketBaseUrl,
      specName: 'Foreign coloring-medium rejection on page update',
    });
    pb = await authedPrimaryClient();
    runId = randomUUID().slice(0, 8);
    const userId = pb.authStore.record!.id;

    // A second, genuinely foreign account that owns a medium the E2E user cannot
    // own. Open signup is required; if it is ever closed this setup throws and
    // the test fails loudly rather than silently passing.
    secondUserPb = new PocketBase(pocketBaseUrl);
    const foreignEmail = `e2e-foreign-${runId}@example.com`;
    const foreignUsername = `e2efgn${runId}`;
    const foreignPassword = `Test-${runId}-Aa1!`;
    const secondUser = await secondUserPb.collection('users').create<RecordWithId>({
      email: foreignEmail,
      username: foreignUsername,
      password: foreignPassword,
      passwordConfirm: foreignPassword,
      name: 'E2E Foreign User',
    });
    secondUserId = secondUser.id;
    await secondUserPb.collection('users').authWithPassword(foreignEmail, foreignPassword);
    const foreignMedium = await secondUserPb.collection('coloring_mediums').create<RecordWithId>({
      user: secondUserPb.authStore.record!.id,
      name: `E2E Foreign Medium ${runId}`,
      type: 'other',
    });
    foreignMediumId = foreignMedium.id;

    // E2E user's own book + page. Creating a book auto-generates `total_pages`
    // page records via a backend hook, so the page is read back, not created.
    const book = await pb.collection('coloring_books').create<RecordWithId>({
      user: userId,
      title: `E2E Foreign Medium ${runId}`,
      status: 'in_progress',
      total_pages: 1,
    });
    bookId = book.id;
    const pages = await pb
      .collection('coloring_pages')
      .getFullList<RecordWithId>({ filter: pb.filter('book = {:bookId}', { bookId: book.id }) });
    if (pages.length === 0) {
      throw new Error('Expected the new coloring book to auto-generate a page.');
    }
    pageId = pages[0].id;

    // E2E user's own medium, used as the positive control.
    const ownMedium = await pb.collection('coloring_mediums').create<RecordWithId>({
      user: userId,
      name: `E2E Own Medium ${runId}`,
      type: 'other',
    });
    ownMediumId = ownMedium.id;
  });

  test.afterAll(async () => {
    const safeDelete = async (run: () => Promise<unknown>) => {
      try {
        await run();
      } catch (error) {
        const status =
          typeof error === 'object' && error && 'status' in error ? error.status : null;
        if (status !== 404) {
          // Best-effort teardown: log but never fail the run on cleanup.
          console.warn('Foreign-medium teardown cleanup failed', error);
        }
      }
    };

    // Deleting the book cascades its pages, so pages need no explicit delete.
    if (bookId) await safeDelete(() => pb.collection('coloring_books').delete(bookId!));
    if (ownMediumId) await safeDelete(() => pb.collection('coloring_mediums').delete(ownMediumId!));
    if (foreignMediumId) {
      await safeDelete(() => secondUserPb.collection('coloring_mediums').delete(foreignMediumId!));
    }
    // Removes the transient prod user created for this run.
    if (secondUserId)
      await safeDelete(() => secondUserPb.collection('users').delete(secondUserId!));
  });

  test("rejects attaching another user's medium to an owned page", async () => {
    expect(pageId, 'page fixture must exist').toBeTruthy();
    expect(foreignMediumId, 'foreign medium fixture must exist').toBeTruthy();

    const rejection = await pb
      .collection('coloring_pages')
      .update(pageId!, { mediums: [foreignMediumId!] })
      .then(
        () => null,
        (error: unknown) => error
      );
    expect(rejection, 'foreign medium update must be rejected').toMatchObject({ status: 400 });

    // Confirm the rejection is attributed to the mediums relation specifically.
    const responseData =
      rejection && typeof rejection === 'object' && 'response' in rejection
        ? (rejection as { response?: { data?: Record<string, unknown> } }).response?.data
        : undefined;
    expect(responseData?.mediums, 'rejection must name the mediums field').toBeDefined();
  });

  test('accepts attaching an owned medium to the same page (positive control)', async () => {
    expect(pageId, 'page fixture must exist').toBeTruthy();
    expect(ownMediumId, 'own medium fixture must exist').toBeTruthy();

    const updated = await pb
      .collection('coloring_pages')
      .update<{ id: string; mediums?: string[] }>(pageId!, { mediums: [ownMediumId!] });
    expect(updated.mediums).toContain(ownMediumId);

    // Reset the relation so the foreign-rejection test does not depend on order.
    await pb.collection('coloring_pages').update(pageId!, { mediums: [] });
  });
});
