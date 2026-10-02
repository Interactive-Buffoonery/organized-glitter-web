import { expect, test } from '@playwright/test';

test('a controlling service worker preserves route and missing-page responses', async ({
  page,
  context,
}) => {
  const backendOrigins: string[] = [];
  await context.route('**/api/collections/**', async route => {
    backendOrigins.push(new URL(route.request().url()).origin);
    await route.fulfill({
      json: { password: { enabled: true }, oauth2: { enabled: false, providers: [] } },
    });
  });
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  const knownPage = await context.newPage();
  try {
    const knownRoute = await knownPage.goto('/login?returnTo=%2Foverview');
    expect(knownRoute?.status()).toBe(200);
    expect(knownRoute?.fromServiceWorker()).toBe(true);
  } finally {
    await knownPage.close();
  }

  const unknownPage = await context.newPage();
  try {
    const unknownRoute = await unknownPage.goto('/not-a-real-cutover-route?source=pwa');
    expect(unknownRoute?.status()).toBe(404);
    expect(unknownRoute?.fromServiceWorker()).toBe(false);
  } finally {
    await unknownPage.close();
  }

  const nestedUnknownPage = await context.newPage();
  try {
    const nestedUnknownRoute = await nestedUnknownPage.goto('/projects/example/not-a-route');
    expect(nestedUnknownRoute?.status()).toBe(404);
  } finally {
    await nestedUnknownPage.close();
  }

  for (const route of ['/about', '/links', '/privacy', '/terms']) {
    const publicPage = await context.newPage();
    try {
      const response = await publicPage.goto(`${route}/`);
      expect(response?.status()).toBe(200);
      expect(response?.fromServiceWorker()).toBe(false);
      await expect(publicPage.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `https://organizedglitter.app${route}`
      );
    } finally {
      await publicPage.close();
    }
  }

  const missingBlogPage = await context.newPage();
  try {
    const response = await missingBlogPage.goto('/updates/removed-post/?source=pwa');
    expect(response?.status()).toBe(404);
    expect(response?.fromServiceWorker()).toBe(false);
  } finally {
    await missingBlogPage.close();
  }

  const assetPage = await context.newPage();
  try {
    const missingAsset = await assetPage.goto('/assets/missing-cutover.js');
    expect(missingAsset?.status()).toBe(404);
  } finally {
    await assetPage.close();
  }
  expect(backendOrigins.length).toBeGreaterThan(0);
  expect(backendOrigins.every(origin => origin === 'http://localhost:4183')).toBe(true);
});
