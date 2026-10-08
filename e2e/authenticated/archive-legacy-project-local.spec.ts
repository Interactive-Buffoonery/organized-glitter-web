import { expect, test } from '@playwright/test';
import PocketBase from 'pocketbase';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import JSZip from 'jszip';

import { assertLocalE2ETargets, isLocalUrl } from '../fixtures/local-safety';

const pocketBaseUrl = process.env.VITE_POCKETBASE_URL;
const appUrl = process.env.E2E_APP_URL;

test.describe('local legacy archive project restore', () => {
  test.skip(
    !isLocalUrl(pocketBaseUrl) || !isLocalUrl(appUrl),
    'Run with the disposable release QA harness and explicit local URLs.'
  );

  test('preserves an archived status with a completion date', async () => {
    assertLocalE2ETargets({ appUrl, pocketBaseUrl, specName: 'Legacy project restore' });
    const email = process.env.E2E_TEST_EMAIL;
    const password = process.env.E2E_TEST_PASSWORD;
    if (!email || !password) throw new Error('Missing local E2E user credentials.');

    const pb = new PocketBase(pocketBaseUrl);
    await pb.collection('users').authWithPassword(email, password);
    let projectId = '';
    try {
      const formData = new FormData();
      formData.set('title', `Legacy restore ${randomUUID()}`);
      formData.set('status', 'progress');
      formData.set('dateCompleted', '2025-03-01');
      const restored = await pb.send<{ id: string; status: string }>(
        '/api/archive/restore-diamond-project',
        { method: 'POST', body: formData }
      );
      projectId = restored.id;
      expect(restored.status).toBe('progress');
      const saved = await pb.collection('projects').getOne(projectId);
      expect(saved.status).toBe('progress');
      expect(String(saved.date_completed).slice(0, 10)).toBe('2025-03-01');
      expect(saved.status_order).toBe(5);
      expect(saved.user).toBe(pb.authStore.record?.id);

      const duplicate = new FormData();
      duplicate.set('id', projectId);
      duplicate.set('title', 'Unexpected replacement');
      duplicate.set('status', 'completed');
      await expect(
        pb.send('/api/archive/restore-diamond-project', { method: 'POST', body: duplicate })
      ).rejects.toMatchObject({ status: 400 });
      const afterDuplicate = await pb.collection('projects').getOne(projectId);
      expect(afterDuplicate.title).toBe(saved.title);
      expect(afterDuplicate.status).toBe('progress');
      expect(afterDuplicate.date_completed).toBe(saved.date_completed);
    } finally {
      if (projectId) await pb.collection('projects').delete(projectId);
    }
  });

  test('rejects invalid archive project numeric fields', async () => {
    assertLocalE2ETargets({
      appUrl,
      pocketBaseUrl,
      specName: 'Project archive numeric validation',
    });
    const email = process.env.E2E_TEST_EMAIL;
    const password = process.env.E2E_TEST_PASSWORD;
    if (!email || !password) throw new Error('Missing local E2E user credentials.');

    const pb = new PocketBase(pocketBaseUrl);
    await pb.collection('users').authWithPassword(email, password);
    const userId = pb.authStore.record?.id;
    if (!userId) throw new Error('Missing authenticated E2E user.');

    for (const [field, value] of [
      ['width', '-1'],
      ['height', '-1'],
      ['colorCount', '-1'],
      ['colorCount', '1.5'],
    ]) {
      const title = `Invalid archive ${randomUUID()}`;
      const formData = new FormData();
      formData.set('title', title);
      formData.set('status', 'progress');
      formData.set(field, value);

      await expect(
        pb.send('/api/archive/restore-diamond-project', { method: 'POST', body: formData })
      ).rejects.toMatchObject({ status: 400 });
      const created = await pb.collection('projects').getFullList({
        filter: pb.filter('user = {:userId} && title = {:title}', { userId, title }),
      });
      expect(created).toHaveLength(0);
    }
  });

  test('round trips stored diamond fields through browser archive export and restore', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    assertLocalE2ETargets({ appUrl, pocketBaseUrl, specName: 'Project archive round trip' });
    const email = process.env.E2E_TEST_EMAIL;
    const password = process.env.E2E_TEST_PASSWORD;
    if (!email || !password) throw new Error('Missing local E2E user credentials.');

    const pb = new PocketBase(pocketBaseUrl);
    await pb.collection('users').authWithPassword(email, password);
    const userId = pb.authStore.record?.id;
    if (!userId) throw new Error('Missing authenticated E2E user.');

    const suffix = randomUUID().slice(0, 8);
    const title = `Archive round trip ${suffix}`;
    const companyName = `Archive company ${suffix}`;
    const artistName = `Archive artist ${suffix}`;
    const tagName = `Archive tag ${suffix}`;
    let projectId = '';
    let companyId = '';
    let artistId = '';
    let tagId = '';
    let projectTagId = '';
    let noteId = '';

    try {
      const company = await pb.collection('companies').create({ user: userId, name: companyName });
      companyId = company.id;
      const artist = await pb.collection('artists').create({ user: userId, name: artistName });
      artistId = artist.id;
      const tag = await pb.collection('tags').create({
        user: userId,
        name: tagName,
        slug: `archive-tag-${suffix}`,
        color: '#7C3AED',
      });
      tagId = tag.id;

      const imageBytes = await readFile(
        fileURLToPath(new URL('../fixtures/portrait-cover.jpg', import.meta.url))
      );
      const source = await pb.collection('projects').create({
        user: userId,
        title,
        company: companyId,
        artist: artistId,
        status: 'completed',
        kit_category: 'mini',
        drill_shape: 'square',
        width: 37.5,
        height: 52.5,
        total_diamonds: 14000,
        color_count: 57,
        date_purchased: '2025-01-02',
        date_received: '2025-01-03',
        date_started: '2025-01-04',
        date_completed: '2025-01-05',
        general_notes: 'Archive metadata note',
        source_url: 'https://example.com/archive-kit',
        image: new File([imageBytes], 'archive-cover.jpg', { type: 'image/jpeg' }),
      });
      projectId = source.id;
      projectTagId = (
        await pb.collection('project_tags').create({ project: projectId, tag: tagId })
      ).id;
      noteId = (
        await pb.collection('progress_notes').create({
          project: projectId,
          content: 'Archive progress note',
          date: '2025-01-04',
        })
      ).id;

      await page.goto('/profile?tab=data');
      await expect(page.getByRole('region', { name: 'Export' })).toBeVisible();
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export full archive' }).click();
      const download = await downloadPromise;
      const archivePath = testInfo.outputPath('organized-glitter-export.zip');
      await download.saveAs(archivePath);
      const zip = await JSZip.loadAsync(await readFile(archivePath));
      const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as {
        diamondProjects: Array<{ title: string; colorCount?: number }>;
      };
      expect(manifest.diamondProjects.find(project => project.title === title)?.colorCount).toBe(
        57
      );

      await pb.collection('progress_notes').delete(noteId);
      noteId = '';
      await pb.collection('project_tags').delete(projectTagId);
      projectTagId = '';
      await pb.collection('projects').delete(projectId);
      projectId = '';

      await page.getByLabel('Archive ZIP file').setInputFiles(archivePath);
      await page.getByRole('button', { name: /^Import archive$/ }).click();
      await expect(page.getByRole('heading', { name: 'Archive import summary' })).toBeVisible({
        timeout: 45_000,
      });

      const saved = await pb
        .collection('projects')
        .getFirstListItem(pb.filter('user = {:userId} && title = {:title}', { userId, title }));
      projectId = saved.id;
      expect(saved).toMatchObject({
        user: userId,
        title,
        company: companyId,
        artist: artistId,
        status: 'completed',
        kit_category: 'mini',
        drill_shape: 'square',
        width: 37.5,
        height: 52.5,
        total_diamonds: 14000,
        color_count: 57,
        general_notes: 'Archive metadata note',
        source_url: 'https://example.com/archive-kit',
      });
      for (const [field, date] of Object.entries({
        date_purchased: '2025-01-02',
        date_received: '2025-01-03',
        date_started: '2025-01-04',
        date_completed: '2025-01-05',
      })) {
        expect(String(saved[field]).slice(0, 10)).toBe(date);
      }
      expect(saved.image).toBeTruthy();

      const restoredTags = await pb.collection('project_tags').getFullList({
        filter: pb.filter('project = {:projectId}', { projectId }),
      });
      expect(restoredTags.map(record => record.tag)).toContain(tagId);
      const restoredNotes = await pb.collection('progress_notes').getFullList({
        filter: pb.filter('project = {:projectId}', { projectId }),
      });
      expect(restoredNotes).toEqual([
        expect.objectContaining({ content: 'Archive progress note' }),
      ]);
      projectTagId = restoredTags[0].id;
      noteId = restoredNotes[0].id;
    } finally {
      if (noteId)
        await pb
          .collection('progress_notes')
          .delete(noteId)
          .catch(() => {});
      if (projectTagId)
        await pb
          .collection('project_tags')
          .delete(projectTagId)
          .catch(() => {});
      if (projectId)
        await pb
          .collection('projects')
          .delete(projectId)
          .catch(() => {});
      if (tagId)
        await pb
          .collection('tags')
          .delete(tagId)
          .catch(() => {});
      if (artistId)
        await pb
          .collection('artists')
          .delete(artistId)
          .catch(() => {});
      if (companyId)
        await pb
          .collection('companies')
          .delete(companyId)
          .catch(() => {});
    }
  });
});
