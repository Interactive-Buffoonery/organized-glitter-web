import { expect, test, type BrowserContext, type Page } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route('**/api/collections/**', route =>
    route.fulfill({
      json: { password: { enabled: true }, oauth2: { enabled: false, providers: [] } },
    })
  );
});

async function waitForController(page: Page) {
  await page.goto('/login');
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
}

async function expectWorkerServes(context: BrowserContext, path: string) {
  const reloaded = await context.newPage();
  try {
    const response = await reloaded.goto(path);
    expect(response?.status()).toBe(200);
    expect(response?.fromServiceWorker()).toBe(true);
    await expect(reloaded.locator('#root')).toBeAttached();
  } finally {
    await reloaded.close();
  }
}

test('app routes load from the network when the precache is gone', async ({ page, context }) => {
  await waitForController(page);

  // Spacefast serves app.html at /app, so a network refetch of the shell is redirected.
  await context.route('**/app.html', route =>
    route.fulfill({ status: 308, headers: { Location: '/login' } })
  );
  // Simulates evicted cache storage behind a still-registered worker.
  await page.evaluate(async () => {
    for (const name of await caches.keys()) await caches.delete(name);
  });

  await expectWorkerServes(context, '/overview');
});

test('app routes load from the network when cache storage throws', async ({ page, context }) => {
  await waitForController(page);

  const [worker] = context.serviceWorkers();
  await worker.evaluate(() => {
    const unreadable = () => Promise.reject(new DOMException('Cache unavailable', 'UnknownError'));
    CacheStorage.prototype.open = unreadable;
    CacheStorage.prototype.match = unreadable;
  });

  await expectWorkerServes(context, '/overview');
});

test('the worker activates when precaching fails', async ({ page, context }) => {
  const failPrecache: Parameters<BrowserContext['route']>[1] = route =>
    route.request().serviceWorker() ? route.abort() : route.fallback();
  await context.route('**/assets/**', failPrecache);

  await waitForController(page);
  await context.unroute('**/assets/**', failPrecache);
  await expectWorkerServes(context, '/overview');
});
