import { devices, expect, test } from '@playwright/test';
import PocketBase from 'pocketbase';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { assertLocalE2ETargets } from '../fixtures/local-safety';

type BrowserGate = {
  url: string;
  ownerEmail: string;
  password: string;
  runDir: string;
};

const gatePath = process.env.PROTECTED_FILE_BROWSER_GATE;
const gate: BrowserGate | null = gatePath ? JSON.parse(readFileSync(gatePath, 'utf8')) : null;
const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';
test.use(
  process.env.E2E_IMAGE_BROWSER === 'webkit'
    ? {
        ...devices['iPhone 13'],
        browserName: 'webkit',
        serviceWorkers: 'block',
        trace: 'retain-on-failure',
      }
    : {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
        serviceWorkers: 'block',
        trace: 'retain-on-failure',
      }
);

test.describe('active session through protected file token rotation', () => {
  test.describe.configure({ retries: 0 });
  test.skip(!gate, 'Requires the disposable protected-file browser gate');
  test.setTimeout(120_000);

  test.afterAll(() => {
    if (gate) writeFileSync(path.join(gate.runDir, 'browser.done'), 'done');
  });

  test('recovers a gallery cover and avatar after a live rotation, then bounds missing-file retries', async ({
    page,
  }) => {
    if (!gate) throw new Error('Missing disposable browser gate');
    assertLocalE2ETargets({
      appUrl,
      pocketBaseUrl: gate.url,
      specName: 'Protected file token rotation',
    });
    const pb = new PocketBase(gate.url);
    await pb.collection('users').authWithPassword(gate.ownerEmail, gate.password);
    const project = await pb
      .collection('projects')
      .getFirstListItem<{ id: string; title: string }>('title = "Existing project"');
    const isMobileWebKit = process.env.E2E_IMAGE_BROWSER === 'webkit';

    let tokenRequests = 0;
    const imageResponses = { projects: [] as number[], users: [] as number[] };
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/files/token') tokenRequests += 1;
    });
    page.on('response', response => {
      const pathname = new URL(response.url()).pathname;
      if (pathname.startsWith('/api/files/projects/'))
        imageResponses.projects.push(response.status());
      if (pathname.startsWith('/api/files/users/')) imageResponses.users.push(response.status());
    });
    let releaseHeld: () => void = () => {};
    const held = new Promise<void>(resolve => {
      releaseHeld = resolve;
    });
    const initialKinds = new Set<string>();
    let holdInitial = true;
    await page.route('**/api/files/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      const kind = pathname.startsWith('/api/files/projects/')
        ? 'projects'
        : pathname.startsWith('/api/files/users/')
          ? 'users'
          : null;
      if (holdInitial && kind) {
        initialKinds.add(kind);
        await held;
      }
      await route.continue();
    });

    await page.goto(`/projects/${project.id}`, { waitUntil: 'domcontentloaded' });
    await page
      .getByRole('button', { name: `View larger image: ${project.title}` })
      .scrollIntoViewIfNeeded();
    const cover = page.getByRole('img', { name: project.title }).first();
    if (isMobileWebKit) {
      await page.getByRole('button', { name: 'Open account menu' }).click();
      await expect(
        page.getByRole('dialog').getByRole('img', { name: 'User avatar' })
      ).toBeVisible();
    }
    await expect.poll(() => [...initialKinds].sort()).toEqual(['projects', 'users']);
    expect(tokenRequests).toBe(1);

    writeFileSync(path.join(gate.runDir, 'rotate.ready'), 'rotate');
    await expect.poll(() => existsSync(path.join(gate.runDir, 'rotated.ready'))).toBe(true);
    holdInitial = false;
    releaseHeld();

    const avatar = isMobileWebKit
      ? page.getByRole('dialog').getByRole('img', { name: 'User avatar' }).first()
      : page.getByRole('img', { name: 'User avatar' }).first();
    await expect
      .poll(() => avatar.evaluate(image => (image as HTMLImageElement).naturalWidth > 0))
      .toBe(true);
    await expect(avatar).toBeVisible();
    expect(imageResponses.users).toContain(200);
    if (isMobileWebKit) {
      await page.getByRole('button', { name: 'Close account menu' }).click();
    }
    await expect
      .poll(() => cover.evaluate(image => (image as HTMLImageElement).naturalWidth > 0))
      .toBe(true);
    await expect(cover).toBeVisible();
    expect(imageResponses.projects).toContain(200);
    if (isMobileWebKit) expect(imageResponses.projects).toContain(404);
    const coverContainer = page
      .getByRole('button', { name: `View larger image: ${project.title}` })
      .locator('..');
    await expect(coverContainer.getByRole('status')).toHaveCount(0);
    expect(tokenRequests, 'both failed images share one recovery token request').toBe(2);
    await page.getByRole('button', { name: `View larger image: ${project.title}` }).click();
    await expect(page.getByRole('dialog', { name: 'Image Gallery' })).toBeVisible();
    await expect
      .poll(() =>
        page
          .getByRole('dialog')
          .getByRole('img', { name: project.title })
          .evaluate(image => (image as HTMLImageElement).naturalWidth > 0)
      )
      .toBe(true);
    await page.getByRole('button', { name: 'Close' }).click();

    const browserContext = page.context();
    await page.close();
    const missingPage = await browserContext.newPage();
    let missingRequests = 0;
    let missingTokenRequests = 0;
    missingPage.on('request', request => {
      const pathname = new URL(request.url()).pathname;
      if (pathname === '/api/files/token') missingTokenRequests += 1;
      if (pathname.startsWith('/api/files/projects/')) {
        missingRequests += 1;
      }
    });
    await missingPage.route('**/api/files/projects/**', route =>
      route.fulfill({ status: 404, body: '' })
    );
    await missingPage.goto(`/projects/${project.id}`);
    const missingCoverContainer = missingPage
      .getByRole('button', { name: `View larger image: ${project.title}` })
      .locator('..');
    await expect(missingCoverContainer.getByRole('status')).toBeVisible();
    await expect.poll(() => missingRequests).toBeGreaterThanOrEqual(1);
    await missingPage.waitForTimeout(2_000);
    expect(missingRequests).toBeLessThanOrEqual(2);
    const missingRequestsAfterFailure = missingRequests;
    const tokenRequestsAfterFailure = missingTokenRequests;
    expect(tokenRequestsAfterFailure).toBeLessThanOrEqual(2);
    await missingPage.waitForTimeout(2_000);
    expect(missingRequests, 'a permanently missing image stops retrying').toBe(
      missingRequestsAfterFailure
    );
    expect(
      missingTokenRequests,
      'a permanently missing image does not keep refreshing tokens'
    ).toBe(tokenRequestsAfterFailure);
  });
});
