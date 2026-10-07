import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { libraryPageHeading } from '../libraryPage';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

const holdMainModule = async (page: Page) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route(/\/assets\/main-[^/]+\.js(?:\?.*)?$/, async route => {
    await pending;
    await route.continue();
  });
  return release;
};

test.describe('private app startup', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`readable ${theme} startup and slow feedback on a narrow phone`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript(value => localStorage.setItem('theme', value), theme);
      await page.clock.install();
      const release = await holdMainModule(page);
      try {
        await page.goto('/dashboard', { waitUntil: 'commit' });
        await expect(page.locator('#app-loading h1')).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath(`startup-${theme}.png`) });
        const status = page.getByRole('status', { name: 'Loading Organized Glitter' });
        await expect(status).toBeVisible();
        await expect(page.locator('#root')).toHaveAttribute('inert', '');
        await expect(page.locator('#root')).not.toHaveAttribute('data-app-ready', 'true');
        const scan = await new AxeBuilder({ page })
          .include('#app-loading')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        expect(scan.violations).toEqual([]);

        await page.clock.fastForward(5_500);
        await expect(page.getByRole('button', { name: 'Reload', exact: true })).toBeVisible();
        await expect(page.getByRole('status', { name: 'Slow startup' })).toContainText(
          'You can wait or reload'
        );
        await page.setViewportSize({ width: 320, height: 568 });
        await page.screenshot({ path: testInfo.outputPath(`slow-startup-${theme}-320px.png`) });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
        const button = page.getByRole('button', { name: 'Reload', exact: true });
        await button.focus();
        await expect(button).toBeFocused();
        expect(await button.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
        expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        const slowScan = await new AxeBuilder({ page }).include('#app-loading').analyze();
        expect(slowScan.violations).toEqual([]);
        if (theme === 'light') {
          await button.click({ noWaitAfter: true });
          await page.unrouteAll({ behavior: 'ignoreErrors' });
          await expect(libraryPageHeading(page)).toBeVisible();
          await expect(page.locator('#app-loading')).toHaveCount(0);
        }
      } finally {
        release();
      }
    });
  }

  for (const entry of ['reload', 'deep link'] as const) {
    test(`${entry} keeps private content hidden until the route mounts`, async ({
      page,
    }, testInfo) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const path = entry === 'reload' ? '/dashboard' : '/projects/localproject003';
      if (entry === 'reload') {
        await page.goto(path);
        await expect(libraryPageHeading(page)).toBeVisible();
      }
      let release!: () => void;
      let chunkHeld = false;
      const pending = new Promise<void>(resolve => {
        release = resolve;
      });
      const chunk =
        entry === 'reload' ? /\/assets\/Dashboard-[^/]+\.js/ : /\/assets\/ProjectDetail-[^/]+\.js/;
      await page.route(chunk, async route => {
        chunkHeld = true;
        await pending;
        await route.continue();
      });
      try {
        if (entry === 'reload') await page.reload({ waitUntil: 'commit' });
        else await page.goto(path, { waitUntil: 'commit' });
        await expect
          .poll(() => chunkHeld, { message: 'The lazy route request must be held' })
          .toBe(true);
        // Auth can commit its spinner before the lazy page starts downloading.
        // Either the static shell or the in-app fallback must own loading.
        await expect
          .poll(async () => {
            const splash = page.locator('#app-loading');
            if (
              (await splash.isVisible()) &&
              (await splash.getAttribute('aria-hidden')) !== 'true'
            ) {
              return (await page.locator('#root').getAttribute('inert')) === '';
            }
            return page.locator('#root').getByRole('status').first().isVisible();
          })
          .toBe(true);
        await expect(page.locator('#root')).not.toHaveAttribute('data-app-ready', 'true');
        await expect(page.getByText('Local Active Kit', { exact: true })).toHaveCount(0);
        await page.screenshot({
          path: testInfo.outputPath(`${entry.replace(' ', '-')}-pending.png`),
        });
      } finally {
        release();
      }
      await expect(page.locator('#app-loading')).toHaveCount(0);
      await expect(page.locator('#root')).toHaveAttribute('data-app-ready', 'true');
      await expect(page.locator('#root')).not.toHaveAttribute('inert', '');
      if (entry === 'reload') await expect(libraryPageHeading(page)).toBeVisible();
      else
        await expect(
          page.getByRole('heading', { level: 1, name: 'Local Active Kit' })
        ).toBeVisible();
      await expect(page).toHaveURL(url => url.pathname === path);
    });
  }

  test('signed-out deep links never render private content', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('pocketbase_auth'));
    await page.goto('/projects/localproject003');
    await expect(
      page.getByRole('heading', { name: 'Welcome Back to Organized Glitter' })
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('Local Active Kit', { exact: true })).toHaveCount(0);
    await expect(page.locator('#app-loading')).toHaveCount(0);
  });

  test('slow project data shows recovery without flashing private content', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.install();
    let requestHeld = false;
    let release!: () => void;
    const pending = new Promise<void>(resolve => {
      release = resolve;
    });
    await page.route(
      /\/api\/collections\/projects\/records\/localproject003(?:\?|$)/,
      async route => {
        requestHeld = true;
        await pending;
        await route.continue();
      }
    );
    try {
      await page.goto('/projects/localproject003');
      await expect.poll(() => requestHeld).toBe(true);
      await expect(page.getByRole('status', { name: 'Loading page content' })).toBeVisible();
      await expect(page.getByText('Local Active Kit', { exact: true })).toHaveCount(0);
      await expect(page.locator('#app-loading')).toHaveCount(0);
      await page.clock.fastForward(5_500);
      await expect(page.getByRole('status', { name: 'Slow page loading' })).toContainText(
        'You can wait or reload'
      );
      await page.screenshot({ path: testInfo.outputPath('slow-project-data.png') });
      await page.getByRole('button', { name: 'Reload', exact: true }).click({
        noWaitAfter: true,
      });
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await expect(page.getByRole('heading', { level: 1, name: 'Local Active Kit' })).toBeVisible();
    } finally {
      release();
    }
  });

  test('slow Library settings show recovery on a cold reload', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard');
    await expect(libraryPageHeading(page)).toBeVisible();
    await page.evaluate(() => history.replaceState(null, '', '/dashboard'));
    await page.clock.install();
    let requestHeld = false;
    let release!: () => void;
    const pending = new Promise<void>(resolve => {
      release = resolve;
    });
    await page.route(
      /\/api\/collections\/user_dashboard_settings\/records(?:\?|$)/,
      async route => {
        if (route.request().method() !== 'GET') return route.continue();
        requestHeld = true;
        await pending;
        await route.continue();
      }
    );
    try {
      await page.reload();
      await expect.poll(() => requestHeld).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('pending-library-settings.png') });
      await expect(page.getByRole('status', { name: 'Loading page content' })).toBeVisible();
      await expect(page.getByText('Local Active Kit', { exact: true })).toHaveCount(0);
      await expect(page.locator('#app-loading')).toHaveCount(0);
      await page.clock.fastForward(5_500);
      await expect(page.getByRole('status', { name: 'Slow page loading' })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('slow-library-settings.png') });
      await page.getByRole('button', { name: 'Reload', exact: true }).click({ noWaitAfter: true });
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await expect(page.getByRole('status', { name: 'Loading page content' })).toHaveCount(0);
      await expect(libraryPageHeading(page)).toBeVisible();
    } finally {
      release();
    }
  });

  test('hung startup stays private and retry can finish startup', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.install();
    const release = await holdMainModule(page);
    try {
      await page.goto('/dashboard', { waitUntil: 'commit' });
      await expect(page.getByRole('status', { name: 'Loading Organized Glitter' })).toBeVisible();
      await page.clock.fastForward(30_500);
      await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
      await expect(page.locator('#root')).toHaveAttribute('inert', '');
      await expect(page.locator('#root')).not.toHaveAttribute('data-app-ready', 'true');
      await page.getByRole('button', { name: 'Try again', exact: true }).click({
        noWaitAfter: true,
      });
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await expect(libraryPageHeading(page)).toBeVisible();
    } finally {
      release();
    }
    await expect(page.locator('#app-loading')).toHaveCount(0);
    await expect(page.locator('#app-error')).toHaveCount(0);
  });
});
