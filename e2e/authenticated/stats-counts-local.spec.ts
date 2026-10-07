import { expect, test, type Locator } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import PocketBase from 'pocketbase';

import { assertLocalE2ETargets } from '../fixtures/local-safety';

const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const pocketBaseUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const currentYear = new Date().getFullYear();

test.use({
  browserName: process.env.E2E_STATS_BROWSER === 'webkit' ? 'webkit' : 'chromium',
  storageState: { cookies: [], origins: [] },
  serviceWorkers: 'block',
});

// Real, isolated local records catch count grammar in both time scopes, omitted
// zero years, incorrect year/count associations, and responsive spacing regressions.
for (const device of [
  { name: 'desktop', width: 1440, height: 1000, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true },
]) {
  test.describe(`Stats counts on ${device.name}`, () => {
    test.use({
      viewport: { width: device.width, height: device.height },
      isMobile: device.mobile,
      hasTouch: device.mobile,
    });

    test('keeps zero, singular, plural and prior-year totals readable', async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      assertLocalE2ETargets({ appUrl, pocketBaseUrl, specName: 'Stats count and year layout' });
      const admin = new PocketBase(pocketBaseUrl);
      await admin
        .collection('_superusers')
        .authWithPassword(
          process.env.LOCAL_POCKETBASE_ADMIN_EMAIL ?? '',
          process.env.LOCAL_POCKETBASE_ADMIN_PASSWORD ?? ''
        );
      const suffix = randomUUID().slice(0, 8);
      const email = `stats-${suffix}@example.test`;
      const password = 'local-stats-password-123';
      const created: { collection: string; id: string }[] = [];
      const create = async (collection: string, data: Record<string, unknown>) => {
        const record = await admin.collection(collection).create(data);
        created.push({ collection, id: record.id });
        return record;
      };

      try {
        const user = await create('users', {
          email,
          username: `stats-${suffix}`,
          password,
          passwordConfirm: password,
          verified: true,
          beta_tester: true,
          coloring_walkthrough_seen: true,
          timezone: 'UTC',
        });
        await create('user_dashboard_settings', {
          user: user.id,
          vertical_enabled: { diamond_painting: true, coloring_books: true },
        });
        const book = await create('coloring_books', {
          user: user.id,
          title: 'Local stats count fixture',
          total_pages: 13,
          status: 'in_progress',
        });
        const pages = await admin.collection('coloring_pages').getFullList({
          filter: admin.filter('book = {:book}', { book: book.id }),
          sort: 'page_number',
        });
        expect(pages).toHaveLength(13);
        let pageIndex = 0;
        const complete = async (year: number, count: number) => {
          for (let index = 0; index < count; index += 1) {
            await create('projects', {
              user: user.id,
              title: `Local stats ${year} ${pageIndex}`,
              status: 'completed',
              kit_category: 'full',
              date_completed: `${year}-01-15`,
            });
            await admin.collection('coloring_pages').update(pages[pageIndex++].id, {
              status: 'completed',
              completed_at: `${year}-01-15`,
            });
          }
        };
        const diamond = page.getByRole('region', { name: 'Diamond paintings', exact: true });
        const coloring = page.getByRole('region', { name: 'Coloring', exact: true });
        const total = (region: Locator) =>
          region.locator('article').getByText(/^\d[\d,]*\s*(paintings?|pages?)$/);
        const checkTotals = async (count: number) => {
          await expect
            .soft(total(diamond))
            .toHaveText(new RegExp(`^${count}\\s*${count === 1 ? 'painting' : 'paintings'}$`));
          await expect
            .soft(total(coloring))
            .toHaveText(new RegExp(`^${count}\\s*${count === 1 ? 'page' : 'pages'}$`));
        };

        await page.goto('/login');
        await page.getByLabel('Email').fill(email);
        await page.getByLabel('Password', { exact: true }).fill(password);
        await page.getByRole('button', { name: 'Sign In' }).click();
        await expect(page).not.toHaveURL(/\/login$/);
        await page.goto('/stats');
        await checkTotals(0);
        await expect(page.getByLabel('Prior year totals')).toHaveCount(0);
        await page.getByRole('button', { name: 'All time', exact: true }).click();
        await checkTotals(0);

        await complete(currentYear, 1);
        await page.reload();
        await checkTotals(1);
        await page.getByRole('button', { name: 'All time', exact: true }).click();
        await checkTotals(1);

        for (let offset = 1; offset <= 4; offset += 1) {
          await complete(currentYear - offset, offset);
        }
        await page.reload();
        await checkTotals(1);
        await expect(diamond.getByLabel('Prior year totals')).toBeVisible();
        await expect(page.locator('#root')).toHaveAttribute('data-app-ready', 'true');
        await expect(page.locator('#root')).not.toHaveAttribute('inert');
        await page.evaluate(() => document.fonts.ready);
        const screenshotPath = testInfo.outputPath(`stats-${device.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        await testInfo.attach(`stats-${device.name}`, {
          path: screenshotPath,
          contentType: 'image/png',
        });

        for (const region of [diamond, coloring]) {
          const rows = region.getByLabel('Prior year totals').locator(':scope > div');
          await expect(rows).toHaveCount(3);
          for (let index = 0; index < 3; index += 1) {
            const row = rows.nth(index);
            await expect(row.locator('dt')).toHaveText(String(currentYear - index - 1));
            await expect(row.locator('dd')).toHaveText(String(index + 1));
            const label = await row.locator('dt').boundingBox();
            const count = await row.locator('dd').boundingBox();
            expect(label).not.toBeNull();
            expect(count).not.toBeNull();
            expect.soft(count!.x - label!.x - label!.width).toBeLessThanOrEqual(24);
            expect(count!.x).toBeGreaterThanOrEqual(label!.x + label!.width);
            expect(Math.abs(count!.y - label!.y)).toBeLessThanOrEqual(4);
          }
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          device.width
        );

        await page.getByRole('button', { name: String(currentYear - 1), exact: true }).click();
        await checkTotals(1);
        await expect(diamond.getByLabel('Prior year totals').locator('dt')).toHaveText([
          String(currentYear - 2),
          String(currentYear - 3),
          String(currentYear - 4),
        ]);
        await complete(currentYear, 2);
        await page.reload();
        await checkTotals(3);
        await page.getByRole('button', { name: 'All time', exact: true }).click();
        await checkTotals(13);
        await expect(page.getByLabel('Prior year totals')).toHaveCount(0);
      } finally {
        for (const record of created.reverse()) {
          await admin.collection(record.collection).delete(record.id);
        }
      }
    });
  });
}
