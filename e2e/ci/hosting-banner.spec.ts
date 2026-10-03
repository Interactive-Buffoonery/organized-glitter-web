import { expect, test } from '@playwright/test';

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`weekend hosting notice in ${colorScheme} mode`, () => {
    test.use({ colorScheme });

    test('appears when signed in without covering page content', async ({ page }) => {
      await page.goto('/overview');
      await expect(page.getByRole('heading', { name: /^Welcome back,/ })).toBeVisible();

      await expect(page.locator('#app-loading')).toHaveCount(0);
      await expect(page.locator('#root')).toHaveCSS('opacity', '1');

      const notice = page
        .getByRole('region')
        .and(page.locator('[data-notice-id="weekend-hosting"]'));
      await expect(notice).toHaveCount(1);
      await expect(notice).toBeVisible();
      await expect(notice).toHaveAttribute('data-notice-id', 'weekend-hosting');
      await expect(notice).toHaveAccessibleName(/\S/);
      const recoveryGuidance = notice.locator('strong');
      await expect(recoveryGuidance).toHaveText(
        "If you don't see your projects, sign out and back in."
      );
      await expect(recoveryGuidance).toHaveCSS('font-weight', '700');
      const bannerBox = await notice.boundingBox();
      const contentBox = await page.locator('#main-content').boundingBox();
      expect(bannerBox).not.toBeNull();
      expect(contentBox).not.toBeNull();
      expect(contentBox!.y).toBeGreaterThanOrEqual(bannerBox!.y + bannerBox!.height);
      const screenshot = test.info().outputPath('signed-in-banner.png');
      await page.screenshot({ path: screenshot });
      await test.info().attach('signed-in-banner', {
        path: screenshot,
        contentType: 'image/png',
      });

      const close = notice.getByRole('button');
      await expect(close).toHaveAccessibleName(/\S/);
      const closeBox = await close.boundingBox();
      expect(closeBox!.width).toBeGreaterThanOrEqual(44);
      expect(closeBox!.height).toBeGreaterThanOrEqual(44);
      await close.focus();
      await page.keyboard.press('Enter');
      await expect(notice).toHaveCount(0);
      await expect(page.locator('#main-content')).toBeFocused();
      await page.goto('/dashboard');
      await expect(page.locator('#main-content')).toBeVisible();
      await expect(notice).toHaveCount(0);
      await page.reload();
      await expect(page.locator('#main-content')).toBeVisible();
      await expect(notice).toHaveCount(0);
    });

    test.describe('signed out', () => {
      test.use({ storageState: { cookies: [], origins: [] } });

      test('appears on home, auth, and public pages', async ({ page }) => {
        for (const route of [
          '/',
          '/login',
          '/register',
          '/about',
          '/links',
          '/privacy',
          '/terms',
        ]) {
          await page.goto(route);
          await expect(page.locator('#app-loading')).toHaveCount(0);
          await expect(page.locator('#root')).toHaveCSS('opacity', '1');
          const notice = page
            .getByRole('region')
            .and(page.locator('[data-notice-id="weekend-hosting"]'));
          await expect(notice).toHaveCount(1);
          await expect(notice).toBeVisible();
          await expect(notice).toHaveAttribute('data-notice-id', 'weekend-hosting');
          await expect(notice).toHaveAccessibleName(/\S/);
          const box = await notice.boundingBox();
          expect(box).not.toBeNull();
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
          if (route === '/') {
            const screenshot = test.info().outputPath('signed-out-banner.png');
            await page.screenshot({ path: screenshot });
            await test.info().attach('signed-out-banner', {
              path: screenshot,
              contentType: 'image/png',
            });
          }
        }

        await page.locator('[data-notice-id="weekend-hosting"]').getByRole('button').click();
        await page.goto('/login');
        await page.getByLabel('Email').fill(process.env.E2E_TEST_EMAIL!);
        await page.getByLabel('Password').fill(process.env.E2E_TEST_PASSWORD!);
        await page.getByRole('button', { name: 'Sign In' }).click();
        await expect(page.getByRole('heading', { name: /^Welcome back,/ })).toBeVisible();
        await expect(
          page.getByRole('region').and(page.locator('[data-notice-id="weekend-hosting"]'))
        ).toHaveCount(0);
      });
    });
  });
}
