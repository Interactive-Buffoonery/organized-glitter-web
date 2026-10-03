import { expect, test } from '@playwright/test';
import { assertLocalE2ETargets } from '../fixtures/local-safety';

const routes = [
  { path: '/projects/new', tag: 'Local Favorite', search: 'Local' },
  { path: '/coloring/new', tag: 'Relaxing', search: 'Relax' },
];

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  for (const route of routes) {
    test(`keyboard selects ${route.tag} in draft at ${viewport.width}px`, async ({ page }) => {
      assertLocalE2ETargets({
        appUrl: process.env.E2E_APP_URL ?? 'http://localhost:3000',
        pocketBaseUrl: process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090',
        specName: 'Tag keyboard selection',
      });
      await page.setViewportSize(viewport);
      await page.goto(route.path);
      await expect(page.getByRole('button', { name: 'Add tag', exact: true })).toBeVisible();
      let releaseTags!: () => void;
      const tagsReady = new Promise<void>(resolve => {
        releaseTags = resolve;
      });
      await page.route(
        /\/api\/collections\/(?:tags|coloring_tags)\/records(?:\?|$)/,
        async request => {
          await tagsReady;
          await request.continue();
        }
      );
      await page.getByRole('button', { name: 'Add tag', exact: true }).click();
      const search = page.getByPlaceholder('Search or create tags...');
      await search.fill(route.search);
      releaseTags();
      const existing = page.getByRole('option', { name: route.tag, exact: true });
      await expect(existing).toBeVisible();
      await search.press('ArrowDown');
      await search.press('ArrowUp');
      await expect(existing).toHaveAttribute('aria-selected', 'true');
      await search.press('Enter');
      await expect(search).not.toBeVisible();
      await expect(page.getByText(route.tag, { exact: true })).toBeVisible();
    });
  }
}
