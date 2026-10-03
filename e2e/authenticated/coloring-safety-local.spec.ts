import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';
import PocketBase from 'pocketbase';

import { assertLocalE2ETargets } from '../fixtures/local-safety';

const pocketBaseUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;

interface RecordWithId {
  id: string;
}

interface ColoringPageRecord extends RecordWithId {
  book: string;
  photos: string[];
}

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lU3bVwAAAABJRU5ErkJggg==',
  'base64'
);

const authenticate = async (userEmail: string, userPassword: string) => {
  const client = new PocketBase(pocketBaseUrl);
  client.autoCancellation(false);
  await client.collection('users').authWithPassword(userEmail, userPassword);
  return client;
};

const expectRejectedWrite = async (write: () => Promise<unknown>) => {
  let rejection: unknown;
  try {
    await write();
  } catch (error) {
    rejection = error;
  }

  expect(rejection).toBeTruthy();
  const status =
    typeof rejection === 'object' && rejection && 'status' in rejection
      ? Number(rejection.status)
      : 0;
  expect(status).toBeGreaterThanOrEqual(400);
  expect(status).toBeLessThan(500);
};

const addPhoto = async (client: PocketBase, pageId: string, name: string) => {
  const body = new FormData();
  body.append('photos+', new File([tinyPng], name, { type: 'image/png' }));
  return client.collection('coloring_pages').update<ColoringPageRecord>(pageId, body);
};

const setMainPhoto = (client: PocketBase, pageId: string, filename: string) =>
  client.send<ColoringPageRecord>(`/api/coloring/pages/${pageId}/main-photo`, {
    method: 'POST',
    body: { filename },
  });

test.describe('Coloring write safety', () => {
  let primary: PocketBase;
  let primaryPeer: PocketBase;
  let secondUser: PocketBase;
  let primaryBookId: string | null = null;
  let primaryPageId: string | null = null;
  let secondBookId: string | null = null;
  let secondUserId: string | null = null;

  test.beforeAll(async () => {
    assertLocalE2ETargets({ appUrl, pocketBaseUrl, specName: 'Coloring write safety' });
    if (!email || !password) {
      throw new Error('Missing E2E_TEST_EMAIL or E2E_TEST_PASSWORD for coloring safety E2E.');
    }

    primary = await authenticate(email, password);
    primaryPeer = await authenticate(email, password);
    const runId = randomUUID().slice(0, 8);
    const secondEmail = `coloring-safety-${runId}@example.test`;
    const secondPassword = `Test-${runId}-Aa1!`;
    secondUser = new PocketBase(pocketBaseUrl);
    secondUser.autoCancellation(false);
    const createdSecondUser = await secondUser.collection('users').create<RecordWithId>({
      email: secondEmail,
      username: `colorsafe${runId}`,
      password: secondPassword,
      passwordConfirm: secondPassword,
      name: 'Coloring Safety User',
    });
    secondUserId = createdSecondUser.id;
    await secondUser.collection('users').authWithPassword(secondEmail, secondPassword);

    const primaryBook = await primary.collection('coloring_books').create<RecordWithId>({
      user: primary.authStore.record!.id,
      title: `Coloring Safety Primary ${runId}`,
      status: 'in_progress',
      total_pages: 1,
    });
    primaryBookId = primaryBook.id;
    const primaryPages = await primary.collection('coloring_pages').getFullList<RecordWithId>({
      filter: primary.filter('book = {:bookId}', { bookId: primaryBook.id }),
    });
    if (primaryPages.length !== 1) {
      throw new Error(`Expected one generated coloring page, got ${primaryPages.length}.`);
    }
    primaryPageId = primaryPages[0].id;

    const secondBook = await secondUser.collection('coloring_books').create<RecordWithId>({
      user: secondUserId,
      title: `Coloring Safety Foreign ${runId}`,
      status: 'in_progress',
      total_pages: 1,
    });
    secondBookId = secondBook.id;
  });

  test.afterAll(async () => {
    const safeDelete = async (run: () => Promise<unknown>) => {
      try {
        await run();
      } catch (error) {
        const status =
          typeof error === 'object' && error && 'status' in error ? error.status : null;
        if (status !== 404) console.warn('Coloring safety teardown cleanup failed', error);
      }
    };

    if (primaryBookId) {
      await safeDelete(() => primary.collection('coloring_books').delete(primaryBookId!));
    }
    if (secondBookId) {
      await safeDelete(() => secondUser.collection('coloring_books').delete(secondBookId!));
    }
    if (secondUserId) {
      await safeDelete(() => secondUser.collection('users').delete(secondUserId!));
    }
  });

  test('preserves concurrent photo uploads and deletes while changing the main photo', async () => {
    const pageId = primaryPageId!;
    const initialBody = new FormData();
    initialBody.append('photos', new File([tinyPng], 'main.png', { type: 'image/png' }));
    initialBody.append('photos', new File([tinyPng], 'detail.png', { type: 'image/png' }));
    const initial = await primary
      .collection('coloring_pages')
      .update<ColoringPageRecord>(pageId, initialBody);
    expect(initial.photos).toHaveLength(2);

    const staleMainTarget = initial.photos[1];
    // The primary client keeps its initial snapshot while another authenticated
    // client changes the file list, which is the stale-client race from INT-550.
    const uploadResult = await addPhoto(primaryPeer, pageId, 'concurrent.png');
    const uploadedFilename = uploadResult.photos.find(photo => !initial.photos.includes(photo));
    expect(uploadedFilename).toBeTruthy();
    await setMainPhoto(primary, pageId, staleMainTarget);

    const afterUpload = await primary
      .collection('coloring_pages')
      .getOne<ColoringPageRecord>(pageId);
    expect(afterUpload.photos[0]).toBe(staleMainTarget);
    expect(new Set(afterUpload.photos)).toEqual(new Set([...initial.photos, uploadedFilename!]));

    const deletedFilename = initial.photos[0];
    await primaryPeer.collection('coloring_pages').update(pageId, {
      'photos-': [deletedFilename],
    });
    await setMainPhoto(primary, pageId, uploadedFilename!);

    const afterDelete = await primary
      .collection('coloring_pages')
      .getOne<ColoringPageRecord>(pageId);
    expect(afterDelete.photos).toEqual([uploadedFilename, staleMainTarget]);
    await expect(setMainPhoto(primary, pageId, deletedFilename)).rejects.toMatchObject({
      status: 409,
      message: 'Photo list changed. Refresh and try again.',
    });
  });

  test('rejects moving coloring records into another user ownership context', async () => {
    await expectRejectedWrite(() =>
      primary.collection('coloring_books').update(primaryBookId!, { user: secondUserId })
    );
    await expectRejectedWrite(() =>
      primary.collection('coloring_pages').update(primaryPageId!, { book: secondBookId })
    );
    await expectRejectedWrite(() => setMainPhoto(secondUser, primaryPageId!, 'foreign.png'));

    expect(await primary.collection('coloring_books').getOne(primaryBookId!)).toMatchObject({
      user: primary.authStore.record!.id,
    });
    expect(await primary.collection('coloring_pages').getOne(primaryPageId!)).toMatchObject({
      book: primaryBookId,
    });
  });
});
