import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import PocketBase from 'pocketbase';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  calculateInventoryDigest,
  calculateItemDigest,
  calculateParentDescriptorDigest,
  sha256Bytes,
} from '../../src/features/import-export/archive/v3/canonical';
import type {
  ArchiveItemV3,
  ArchivePartManifestV3,
} from '../../src/features/import-export/archive/v3/types';
import { assertLocalE2ETargets, isLocalUrl } from '../fixtures/local-safety';

const rootDir = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const pbUrl = process.env.VITE_POCKETBASE_URL ?? 'http://127.0.0.1:8090';
const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const runId = randomUUID();
const titlePrefix = `V3 E2E ${runId}`;
const backupIds: string[] = [];

type ZipInput = { name: string; mimeType: string; buffer: Buffer };

function project(itemId: string, title: string, assets: ArchiveItemV3['assets'] = []) {
  const unsigned = {
    itemId,
    kind: 'diamond-project' as const,
    metadata: { title, status: 'progress' as const, tags: [] },
    assets,
  };
  return { ...unsigned, digest: calculateItemDigest(unsigned) };
}

function projectParent(itemId: string, title: string) {
  const unsigned = {
    itemId,
    kind: 'diamond-project' as const,
    metadata: { title, status: 'progress' as const, tags: [] },
  };
  return { ...unsigned, digest: calculateParentDescriptorDigest(unsigned) };
}

function projectNote(itemId: string, parent: ReturnType<typeof projectParent>) {
  const unsigned = {
    itemId,
    kind: 'diamond-project-note' as const,
    parent,
    metadata: { content: 'Restored from a child-first part', date: '2026-09-22' },
    assets: [],
  };
  return { ...unsigned, digest: calculateItemDigest(unsigned) };
}

async function archivePart(input: {
  backupId: string;
  partNumber: number;
  partCount: number;
  items: ArchiveItemV3[];
  files?: Map<string, Buffer>;
  name?: string;
}): Promise<ZipInput> {
  const unsigned = {
    schemaVersion: 3 as const,
    source: 'organized-glitter' as const,
    backupId: input.backupId,
    exportedAt: '2026-09-22T12:00:00.000Z',
    partNumber: input.partNumber,
    partCount: input.partCount,
    partId: `${input.backupId}:${input.partNumber}`,
    items: input.items,
    warnings: [],
  };
  const manifest: ArchivePartManifestV3 = {
    ...unsigned,
    inventoryDigest: calculateInventoryDigest(unsigned),
  };
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest));
  for (const [filePath, bytes] of input.files ?? []) zip.file(filePath, bytes);
  return {
    name: input.name ?? `v3-part-${input.partNumber}.zip`,
    mimeType: 'application/zip',
    buffer: await zip.generateAsync({ type: 'nodebuffer' }),
  };
}

async function openRestore(page: Page) {
  await page.goto('/profile?tab=data');
  await expect(page.getByRole('region', { name: 'Restore archive' })).toBeVisible();
}

async function recordsWithTitle(pb: PocketBase, title: string) {
  return pb.collection('projects').getFullList<{ id: string; image: string }>({
    filter: pb.filter('title = {:title}', { title }),
  });
}

test.describe('local v3 archive restore', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ serviceWorkers: 'block' });
  test.skip(!isLocalUrl(pbUrl), `V3 restore E2E requires local PocketBase, got ${pbUrl}`);

  let user: PocketBase;
  let admin: PocketBase;

  test.beforeAll(async () => {
    assertLocalE2ETargets({ appUrl, pocketBaseUrl: pbUrl, specName: 'Local v3 restore' });
    const email = process.env.E2E_TEST_EMAIL;
    const password = process.env.E2E_TEST_PASSWORD;
    if (!email || !password) throw new Error('Missing E2E_TEST_EMAIL or E2E_TEST_PASSWORD');
    user = new PocketBase(pbUrl);
    await user.collection('users').authWithPassword(email, password);
    admin = new PocketBase(pbUrl);
    await admin
      .collection('_superusers')
      .authWithPassword(
        process.env.LOCAL_POCKETBASE_ADMIN_EMAIL ?? 'admin@localhost.dev',
        process.env.LOCAL_POCKETBASE_ADMIN_PASSWORD ?? 'admin123456'
      );
  });

  test.afterAll(async () => {
    if (!admin) return;
    for (const backupId of backupIds) {
      const receipts = await admin.collection('archive_restore_items').getFullList({
        filter: admin.filter('backup_id = {:backupId}', { backupId }),
      });
      for (const receipt of receipts)
        await admin.collection('archive_restore_items').delete(receipt.id);
    }
    const projects = await admin.collection('projects').getFullList<{ id: string }>({
      filter: admin.filter('title ~ {:prefix}', { prefix: titlePrefix }),
    });
    for (const projectRecord of projects) {
      const notes = await admin.collection('progress_notes').getFullList({
        filter: admin.filter('project = {:projectId}', { projectId: projectRecord.id }),
      });
      for (const note of notes) await admin.collection('progress_notes').delete(note.id);
      await admin.collection('projects').delete(projectRecord.id);
    }
    const books = await admin.collection('coloring_books').getFullList<{ id: string }>({
      filter: admin.filter('title ~ {:prefix}', { prefix: titlePrefix }),
    });
    for (const bookRecord of books) {
      const pages = await admin.collection('coloring_pages').getFullList<{ id: string }>({
        filter: admin.filter('book = {:bookId}', { bookId: bookRecord.id }),
      });
      for (const pageRecord of pages) {
        for (const collection of [
          'coloring_page_progress_notes',
          'coloring_page_color_references',
        ]) {
          const children = await admin.collection(collection).getFullList({
            filter: admin.filter('page = {:pageId}', { pageId: pageRecord.id }),
          });
          for (const child of children) await admin.collection(collection).delete(child.id);
        }
        await admin.collection('coloring_pages').delete(pageRecord.id);
      }
      await admin.collection('coloring_books').delete(bookRecord.id);
    }
    const mediums = await admin.collection('coloring_mediums').getFullList({
      filter: admin.filter('name ~ {:prefix}', { prefix: titlePrefix }),
    });
    for (const medium of mediums) await admin.collection('coloring_mediums').delete(medium.id);
  });

  test('restores a child-first part, adds its parent cover, and safely retries', async ({
    page,
  }) => {
    const backupId = randomUUID();
    backupIds.push(backupId);
    const title = `${titlePrefix} child first`;
    const projectId = `diamond-project:${backupId}`;
    const coverBytes = await readFile(path.join(rootDir, 'e2e/fixtures/portrait-cover.jpg'));
    const coverPath = 'assets/project-cover/portrait-cover.jpg';
    const cover = {
      assetId: 'project-cover',
      digest: sha256Bytes(coverBytes),
      byteLength: coverBytes.byteLength,
      path: coverPath,
      role: 'project-cover' as const,
      field: 'image',
      originalFilename: 'portrait-cover.jpg',
      contentType: 'image/jpeg',
    };
    const first = await archivePart({
      backupId,
      partNumber: 1,
      partCount: 2,
      items: [projectNote(`diamond-project-note:${backupId}`, projectParent(projectId, title))],
    });
    const second = await archivePart({
      backupId,
      partNumber: 2,
      partCount: 2,
      items: [project(projectId, title, [cover])],
      files: new Map([[coverPath, coverBytes]]),
    });

    await openRestore(page);
    await page.getByLabel('Archive ZIP file').setInputFiles([second, first]);
    await page.getByLabel(`Select ${second.name}`).uncheck();
    await page.getByRole('button', { name: 'Import archive' }).click();
    await expect(page.getByText('Selected parts restored')).toBeVisible();
    await expect(page.getByText(/Missing Part 2/)).toBeVisible();
    const [scaffold] = await recordsWithTitle(user, title);
    expect(scaffold).toBeTruthy();
    expect(scaffold.image).toBeFalsy();
    const notesAfterFirst = await user.collection('progress_notes').getFullList({
      filter: user.filter('project = {:projectId}', { projectId: scaffold.id }),
    });
    expect(notesAfterFirst).toHaveLength(1);

    await page.getByLabel(`Select ${second.name}`).check();
    await page.getByRole('button', { name: 'Import archive' }).click();
    await expect(page.getByText('Backup restored')).toBeVisible();
    const [finished] = await recordsWithTitle(user, title);
    expect(finished.id).toBe(scaffold.id);
    expect(finished.image).toBeTruthy();

    await page.getByRole('button', { name: 'Import archive' }).click();
    await expect(page.getByText('Backup restored')).toBeVisible();
    expect(await recordsWithTitle(user, title)).toHaveLength(1);
    const notesAfterRetry = await user.collection('progress_notes').getFullList({
      filter: user.filter('project = {:projectId}', { projectId: scaffold.id }),
    });
    expect(notesAfterRetry).toHaveLength(1);
  });

  test('rejects a mixed backup and a corrupt asset before writing', async ({ page }) => {
    const firstId = randomUUID();
    const secondId = randomUUID();
    backupIds.push(firstId, secondId);
    const firstTitle = `${titlePrefix} mixed first`;
    const secondTitle = `${titlePrefix} mixed second`;
    const first = await archivePart({
      backupId: firstId,
      partNumber: 1,
      partCount: 2,
      items: [project(`diamond-project:${firstId}`, firstTitle)],
    });
    const second = await archivePart({
      backupId: secondId,
      partNumber: 2,
      partCount: 2,
      items: [project(`diamond-project:${secondId}`, secondTitle)],
    });
    let writes = 0;
    await page.route('**/api/archive/v3/restore-item', route => {
      writes += 1;
      return route.continue();
    });
    await openRestore(page);
    await page.getByLabel('Archive ZIP file').setInputFiles([first, second]);
    await page.getByRole('button', { name: 'Import archive' }).click();
    await expect(page.getByText('Restore failed')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Restore archive' }).getByText(/same backup set/)
    ).toBeVisible();
    expect(writes).toBe(0);
    expect(await recordsWithTitle(user, firstTitle)).toHaveLength(0);
    expect(await recordsWithTitle(user, secondTitle)).toHaveLength(0);

    const corruptId = randomUUID();
    backupIds.push(corruptId);
    const corruptTitle = `${titlePrefix} corrupt`;
    const declared = Buffer.from([1, 2, 3]);
    const assetPath = 'assets/corrupt/photo.jpg';
    const corruptAsset = {
      assetId: 'corrupt',
      digest: sha256Bytes(declared),
      byteLength: declared.byteLength,
      path: assetPath,
      role: 'project-cover' as const,
      field: 'image',
      originalFilename: 'photo.jpg',
    };
    const corrupt = await archivePart({
      backupId: corruptId,
      partNumber: 1,
      partCount: 1,
      items: [project(`diamond-project:${corruptId}`, corruptTitle, [corruptAsset])],
      files: new Map([[assetPath, Buffer.from([9, 9, 9])]]),
    });
    await page.getByLabel('Archive ZIP file').setInputFiles(corrupt);
    await page.getByRole('button', { name: 'Import archive' }).click();
    await expect(page.getByText('Restore failed')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Restore archive' }).getByText(/asset digest mismatch/i)
    ).toBeVisible();
    expect(writes).toBe(0);
    expect(await recordsWithTitle(user, corruptTitle)).toHaveLength(0);
  });

  test('restores every coloring item kind through the browser and hook', async ({ page }) => {
    const backupId = randomUUID();
    backupIds.push(backupId);
    const bookTitle = `${titlePrefix} coloring book`;
    const mediumName = `${titlePrefix} medium`;
    const mediumUnsigned = {
      itemId: `coloring-medium:${backupId}`,
      kind: 'coloring-medium' as const,
      metadata: { name: mediumName, type: 'colored_pencil' as const },
      assets: [],
    };
    const medium = { ...mediumUnsigned, digest: calculateItemDigest(mediumUnsigned) };
    const bookId = `coloring-book:${backupId}`;
    const bookMetadata = {
      title: bookTitle,
      isMystery: false,
      status: 'in_progress' as const,
      totalPages: 1,
      tags: [],
    };
    const bookUnsigned = {
      itemId: bookId,
      kind: 'coloring-book' as const,
      metadata: bookMetadata,
      assets: [],
    };
    const book = { ...bookUnsigned, digest: calculateItemDigest(bookUnsigned) };
    const bookParentUnsigned = { itemId: bookId, kind: bookUnsigned.kind, metadata: bookMetadata };
    const bookParent = {
      ...bookParentUnsigned,
      digest: calculateParentDescriptorDigest(bookParentUnsigned),
    };
    const pageId = `coloring-page:${backupId}`;
    const pageMetadata = {
      pageNumber: 1,
      status: 'in_progress' as const,
      mediumItemIds: [medium.itemId],
    };
    const pageUnsigned = {
      itemId: pageId,
      kind: 'coloring-page' as const,
      parent: bookParent,
      metadata: pageMetadata,
      assets: [],
    };
    const coloringPage = { ...pageUnsigned, digest: calculateItemDigest(pageUnsigned) };
    const pageParentUnsigned = {
      itemId: pageId,
      kind: pageUnsigned.kind,
      parent: bookParent,
      metadata: pageMetadata,
    };
    const pageParent = {
      ...pageParentUnsigned,
      digest: calculateParentDescriptorDigest(pageParentUnsigned),
    };
    const noteUnsigned = {
      itemId: `coloring-page-note:${backupId}`,
      kind: 'coloring-page-note' as const,
      parent: pageParent,
      metadata: { content: 'V3 restored page note', date: '2026-09-22' },
      assets: [],
    };
    const note = { ...noteUnsigned, digest: calculateItemDigest(noteUnsigned) };
    const referenceUnsigned = {
      itemId: `coloring-color-reference:${backupId}`,
      kind: 'coloring-color-reference' as const,
      parent: pageParent,
      metadata: { notes: 'V3 restored palette' },
      assets: [],
    };
    const reference = {
      ...referenceUnsigned,
      digest: calculateItemDigest(referenceUnsigned),
    };
    const imageBytes = await readFile(path.join(rootDir, 'e2e/fixtures/portrait-cover.jpg'));
    const imagePath = 'assets/coloring-page-photo/portrait-cover.jpg';
    const galleryUnsigned = {
      itemId: `asset:${backupId}`,
      kind: 'asset' as const,
      parent: pageParent,
      metadata: { position: 0 },
      assets: [
        {
          assetId: 'coloring-page-photo',
          digest: sha256Bytes(imageBytes),
          byteLength: imageBytes.byteLength,
          path: imagePath,
          role: 'coloring-page-photo' as const,
          field: 'photos',
          originalFilename: 'portrait-cover.jpg',
          contentType: 'image/jpeg',
        },
      ],
    };
    const gallery = { ...galleryUnsigned, digest: calculateItemDigest(galleryUnsigned) };
    const archive = await archivePart({
      backupId,
      partNumber: 1,
      partCount: 1,
      items: [medium, book, coloringPage, note, reference, gallery],
      files: new Map([[imagePath, imageBytes]]),
    });

    await openRestore(page);
    await page.getByLabel('Archive ZIP file').setInputFiles(archive);
    await page.getByRole('button', { name: 'Import archive' }).click();
    await expect(page.getByText('Backup restored')).toBeVisible();
    const [restoredBook] = await user.collection('coloring_books').getFullList<{ id: string }>({
      filter: user.filter('title = {:title}', { title: bookTitle }),
    });
    expect(restoredBook).toBeTruthy();
    const [restoredPage] = await user.collection('coloring_pages').getFullList<{
      id: string;
      photos: string[];
      mediums: string[];
    }>({ filter: user.filter('book = {:bookId}', { bookId: restoredBook.id }) });
    expect(restoredPage.photos).toHaveLength(1);
    const [restoredMedium] = await user.collection('coloring_mediums').getFullList<{ id: string }>({
      filter: user.filter('name = {:name}', { name: mediumName }),
    });
    expect(restoredPage.mediums).toContain(restoredMedium.id);
    const notes = await user.collection('coloring_page_progress_notes').getFullList({
      filter: user.filter('page = {:pageId}', { pageId: restoredPage.id }),
    });
    expect(notes).toHaveLength(1);
    const references = await user.collection('coloring_page_color_references').getFullList({
      filter: user.filter('page = {:pageId}', { pageId: restoredPage.id }),
    });
    expect(references).toHaveLength(1);
  });

  test('resumes after a lost response without duplicating confirmed items', async ({ page }) => {
    const backupId = randomUUID();
    backupIds.push(backupId);
    const firstTitle = `${titlePrefix} interrupted first`;
    const secondTitle = `${titlePrefix} interrupted second`;
    const archive = await archivePart({
      backupId,
      partNumber: 1,
      partCount: 1,
      items: [
        project(`diamond-project:${backupId}:1`, firstTitle),
        project(`diamond-project:${backupId}:2`, secondTitle),
      ],
    });
    let requests = 0;
    await page.route('**/api/archive/v3/restore-item', async route => {
      requests += 1;
      if (requests === 2) return route.abort('connectionreset');
      return route.continue();
    });
    await openRestore(page);
    await page.getByLabel('Archive ZIP file').setInputFiles(archive);
    await page.getByRole('button', { name: 'Import archive' }).click();
    await expect(page.getByText('Restore finished with issues')).toBeVisible();
    expect(await recordsWithTitle(user, firstTitle)).toHaveLength(1);
    expect(await recordsWithTitle(user, secondTitle)).toHaveLength(0);

    await page.unroute('**/api/archive/v3/restore-item');
    await page.reload();
    await page.getByLabel('Archive ZIP file').setInputFiles(archive);
    await page.getByRole('button', { name: 'Import archive' }).click();
    await expect(page.getByText('Backup restored')).toBeVisible();
    expect(await recordsWithTitle(user, firstTitle)).toHaveLength(1);
    expect(await recordsWithTitle(user, secondTitle)).toHaveLength(1);
  });
});
