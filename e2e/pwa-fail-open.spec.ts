import { expect, test } from '@playwright/test';

test('app routes load from the network when the precache is gone', async ({ page, context }) => {
  await context.route('**/api/collections/**', route =>
    route.fulfill({
      json: { password: { enabled: true }, oauth2: { enabled: false, providers: [] } },
    })
  );
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  // Spacefast serves app.html at /app, so a network refetch of the shell is redirected.
  await context.route('**/app.html', route =>
    route.fulfill({ status: 308, headers: { Location: '/login' } })
  );
  // Simulates evicted or unreadable cache storage behind a still-registered worker.
  await page.evaluate(async () => {
    for (const name of await caches.keys()) await caches.delete(name);
  });

  const reloaded = await context.newPage();
  try {
    const response = await reloaded.goto('/overview');
    expect(response?.status()).toBe(200);
    await expect(reloaded.locator('#root')).toBeAttached();
  } finally {
    await reloaded.close();
  }
});
