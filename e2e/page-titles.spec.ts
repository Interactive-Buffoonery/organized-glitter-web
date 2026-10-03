import { expect, test } from '@playwright/test';

const publicTitleRoutes = [
  { path: '/login', title: 'Login | Organized Glitter' },
  { path: '/register', title: 'Register | Organized Glitter' },
  { path: '/forgot-password', title: 'Forgot Password | Organized Glitter' },
  { path: '/about', title: 'About | Organized Glitter' },
  { path: '/privacy', title: 'Privacy policy | Organized Glitter' },
  { path: '/terms', title: 'Terms of service | Organized Glitter' },
  { path: '/links', title: /Links \| Organized Glitter$/ },
  { path: '/missing-page-title-route', title: 'Page not found | Organized Glitter' },
];

test.describe('Public page titles', () => {
  for (const route of publicTitleRoutes) {
    test(`${route.path} has a specific document title`, async ({ page }) => {
      await page.goto(route.path);

      await expect(page).toHaveTitle(route.title);
    });
  }
});

/**
 * Robots meta on auth vs. marketing routes (#77).
 *
 * Auth surfaces (/login, /register, /forgot-password) call `useNoIndexPage`,
 * which injects `<meta name="robots" content="noindex, nofollow">` client-side
 * via `usePageMetadata`. Public marketing pages (/about, /privacy, /terms) do
 * NOT, and `index.html` ships no static robots meta, so those routes must carry
 * zero robots meta. The robots tag is injected after hydration, so each
 * assertion waits for the app shell (`#main-content`) before reading the tag.
 */
const noindexAuthRoutes = ['/login', '/register', '/forgot-password'];
const indexableMarketingRoutes = ['/about', '/privacy', '/terms'];

test.describe('Robots meta directives', () => {
  for (const route of noindexAuthRoutes) {
    test(`${route} is noindexed`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator('#main-content')).toBeVisible();

      // toHaveAttribute polls, so it tolerates the client-side injection delay.
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        'content',
        'noindex, nofollow'
      );
    });
  }

  for (const route of indexableMarketingRoutes) {
    test(`${route} carries no noindex robots meta`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator('#main-content')).toBeVisible();

      // Give any (incorrect) client-side robots injection a chance to appear so
      // the absence assertion is not racing hydration.
      await page.waitForTimeout(1_000);

      const robotsMeta = page.locator('meta[name="robots"]');
      const count = await robotsMeta.count();
      if (count > 0) {
        // If a robots tag is ever added to marketing pages it must not suppress
        // indexing; never `noindex`.
        await expect(robotsMeta).not.toHaveAttribute('content', /noindex/i);
      } else {
        expect(count).toBe(0);
      }
    });
  }
});

test('public navigation updates canonical and social metadata without a page reload', async ({
  page,
}) => {
  await page.goto('/');
  const routes = [
    { label: 'About', path: '/about', title: 'About | Organized Glitter' },
    { label: 'Privacy', path: '/privacy', title: 'Privacy policy | Organized Glitter' },
    { label: 'Terms', path: '/terms', title: 'Terms of service | Organized Glitter' },
    { label: 'Links', path: '/links', title: "Sarah's Links | Organized Glitter" },
  ];

  for (const route of routes) {
    await page.locator('footer').getByRole('link', { name: route.label }).click();
    await expect(page).toHaveURL(new RegExp(`${route.path}$`));
    await expect(page).toHaveTitle(route.title);
    const url = `https://organizedglitter.app${route.path}`;
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', url);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', url);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', route.title);
    await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute(
      'content',
      route.title
    );
  }
});
