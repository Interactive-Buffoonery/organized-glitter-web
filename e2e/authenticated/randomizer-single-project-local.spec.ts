import { expect, test, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import PocketBase from 'pocketbase';

import { assertLocalE2ETargets } from '../fixtures/local-safety';

const longTitle = 'A quiet evening in the garden with ExtraordinaryUnbrokenProjectTitle';

test.use({ browserName: process.env.E2E_RANDOMIZER_BROWSER === 'webkit' ? 'webkit' : 'chromium' });

const captureWheel = async (page: Page, testInfo: TestInfo, step: string) => {
  const wheel = page.getByRole('button', { name: /^Randomizer wheel with/ });
  const graphic = (await wheel.count())
    ? wheel
    : page.getByRole('img', { name: 'Empty randomizer wheel' });
  const screenshot = testInfo.outputPath(`${step}.png`);
  await ((await wheel.count()) ? graphic.locator('xpath=../..') : graphic).screenshot({
    path: screenshot,
    animations: 'disabled',
  });
  await testInfo.attach(step, { path: screenshot, contentType: 'image/png' });
};

for (const device of ['desktop', 'mobile', 'mobile-reduced-motion'] as const) {
  test.describe(`Randomizer selection presentation ${device}`, () => {
    test.use({
      viewport:
        device === 'desktop'
          ? { width: 1280, height: 900 }
          : { width: device === 'mobile' ? 320 : 390, height: 844 },
      isMobile: device !== 'desktop',
      hasTouch: device !== 'desktop',
      reducedMotion: device === 'mobile-reduced-motion' ? 'reduce' : 'no-preference',
      serviceWorkers: 'block',
    });

    let pb: PocketBase;
    const projectIds: string[] = [];

    test.beforeAll(async () => {
      assertLocalE2ETargets({
        appUrl: process.env.E2E_APP_URL,
        pocketBaseUrl: process.env.VITE_POCKETBASE_URL,
        specName: 'Randomizer single project presentation',
      });
      const email = process.env.E2E_TEST_EMAIL;
      const password = process.env.E2E_TEST_PASSWORD;
      if (!email || !password) throw new Error('Local E2E credentials are required.');
      pb = new PocketBase(process.env.VITE_POCKETBASE_URL);
      await pb.collection('users').authWithPassword(email, password);
      for (const title of [longTitle, 'Second single-project regression fixture']) {
        const project = await pb.collection('projects').create({
          user: pb.authStore.record!.id,
          title,
          status: 'progress',
          kit_category: 'full',
        });
        projectIds.push(project.id);
      }
    });

    test.afterAll(async () => {
      for (const id of projectIds) {
        const spins = await pb.collection('randomizer_spins').getFullList({
          filter: pb.filter('project = {:project}', { project: id }),
        });
        for (const spin of spins) await pb.collection('randomizer_spins').delete(spin.id);
        await pb.collection('projects').delete(id);
      }
    });

    test.afterEach(async ({ page }, testInfo) => {
      try {
        await page.goto('/profile?tab=preferences');
        await page
          .getByRole('radiogroup', { name: 'Theme' })
          .getByRole('radio', {
            name: /^System\b/,
          })
          .click();
        await expect
          .poll(
            async () =>
              (await pb.collection('users').getOne(pb.authStore.record!.id)).theme_preference
          )
          .toBe('system');
      } catch (error) {
        if (testInfo.status === testInfo.expectedStatus) throw error;
      }
    });

    for (const theme of ['light', 'dark'] as const) {
      test(`zero, one and multiple selections in ${theme}`, async ({ page }, testInfo) => {
        await page.goto('/profile?tab=preferences');
        await page
          .getByRole('radiogroup', { name: 'Theme' })
          .getByRole('radio', {
            name: new RegExp(`^${theme}\\b`, 'i'),
          })
          .click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await page.goto('/randomizer');
        await expect(page.locator('#root')).toHaveAttribute('data-app-ready', 'true');
        await expect(page.locator('#root')).not.toHaveAttribute('inert', '');
        await page.getByRole('button', { name: 'Diamond paintings', exact: true }).click();

        const selection = page.getByRole('region', { name: 'Choose items' });
        await selection.getByRole('button', { name: 'Deselect all', exact: true }).click();
        await expect(page.getByRole('img', { name: 'Empty randomizer wheel' })).toBeVisible();
        await expect(
          page.getByRole('button', { name: /disabled, no targets selected/ })
        ).toBeDisabled();
        await captureWheel(page, testInfo, 'zero');

        await selection
          .getByRole('button', { name: new RegExp(`^Select ${longTitle}\\.`) })
          .click();
        const wheel = page.getByRole('button', {
          name: 'Randomizer wheel with 1 items',
          exact: true,
        });
        await expect(wheel).toHaveAttribute('aria-disabled', 'false');
        await captureWheel(page, testInfo, 'one');
        await expect(wheel.getByText('1 item selected', { exact: true })).toBeVisible();
        const title = page.getByTestId('randomizer-single-title');
        await expect(title).toHaveText(longTitle);
        await expect(title).toBeVisible();
        expect(
          await title.evaluate(
            element =>
              element.scrollWidth <= element.clientWidth &&
              element.scrollHeight <= element.clientHeight
          )
        ).toBe(true);
        await expect(title).toHaveCSS('-webkit-line-clamp', 'none');
        await expect(wheel).toHaveAccessibleDescription(new RegExp(longTitle));
        const center = wheel.locator('[data-testid="randomizer-single-target"]');
        const geometry = await center.evaluate(element => {
          const box = element.getBoundingClientRect();
          const disc = element
            .parentElement!.querySelector('[data-testid="randomizer-wheel-disc"]')!
            .getBoundingClientRect();
          const label = element.querySelector('p')!;
          return {
            x: Math.abs(box.x + box.width / 2 - (disc.x + disc.width / 2)),
            y: Math.abs(box.y + box.height / 2 - (disc.y + disc.height / 2)),
            numberSize: Number.parseFloat(getComputedStyle(label).fontSize),
            titleFits:
              element.scrollWidth <= element.clientWidth &&
              element.scrollHeight <= element.clientHeight,
          };
        });
        expect(geometry.x).toBeLessThan(1);
        expect(geometry.y).toBeLessThan(1);
        expect(geometry.numberSize).toBeGreaterThanOrEqual(36);
        expect(geometry.titleFits).toBe(true);
        expect(
          (
            await new AxeBuilder({ page })
              .include('[aria-label="Randomizer wheel with 1 items"]')
              .analyze()
          ).violations
        ).toEqual([]);

        let writes = 0;
        page.on('request', request => {
          if (
            request.method() === 'POST' &&
            new URL(request.url()).pathname === '/api/collections/randomizer_spins/records'
          )
            writes += 1;
        });
        const savedSpin = page.waitForResponse(
          response =>
            response.request().method() === 'POST' &&
            new URL(response.url()).pathname === '/api/collections/randomizer_spins/records'
        );
        if (device === 'desktop') {
          await wheel.focus();
          await wheel.press('Enter');
        } else {
          await wheel.tap();
        }
        await expect(page.getByRole('button', { name: /Spinning/ })).toBeDisabled();
        await expect(center).toHaveCSS('transform', 'none');
        await expect(page.getByRole('button', { name: 'Clear result', exact: true })).toBeVisible({
          timeout: 8000,
        });
        const saved = await savedSpin;
        expect(saved.ok()).toBe(true);
        expect((await saved.json()).project).toBe(projectIds[0]);
        expect(writes).toBe(1);
        await expect(page.getByRole('link', { name: 'View project' })).toHaveAttribute(
          'href',
          new RegExp(`/projects/${projectIds[0]}`)
        );
        await expect(title).toBeVisible();

        await page.getByRole('button', { name: 'Clear result', exact: true }).click();
        await selection
          .getByRole('button', { name: /^Select Second single-project regression fixture\./ })
          .click();
        const multiWheel = page.getByRole('button', {
          name: 'Randomizer wheel with 2 items',
          exact: true,
        });
        await expect(multiWheel).toBeVisible();
        await expect(multiWheel.getByText('1 item selected')).toHaveCount(0);
        await expect(multiWheel.locator('svg text')).toHaveCount(4);
        await captureWheel(page, testInfo, 'multiple');
        const savedMultiSpin = page.waitForResponse(
          response =>
            response.request().method() === 'POST' &&
            new URL(response.url()).pathname === '/api/collections/randomizer_spins/records'
        );
        await page
          .getByRole('button', { name: /^Spin the wheel to randomly select from 2 items/ })
          .click();
        await expect(page.getByRole('button', { name: 'Clear result', exact: true })).toBeVisible({
          timeout: 8000,
        });
        const savedMulti = await savedMultiSpin;
        expect(savedMulti.ok()).toBe(true);
        expect(projectIds).toContain((await savedMulti.json()).project);
        expect(writes).toBe(2);
        await expectNoHorizontalOverflow(page);
      });
    }
  });
}

const expectNoHorizontalOverflow = async (page: Page) => {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  ).toBe(true);
};
