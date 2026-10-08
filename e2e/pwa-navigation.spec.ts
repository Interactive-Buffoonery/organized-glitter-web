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
        new URL(route, 'http://localhost:4183').href
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

test('offline precaching starts after readiness and preserves the complete app graph', async ({
  page,
  context,
  browserName,
}, testInfo) => {
  const requests: {
    path: string;
    type: string;
    worker: boolean;
    at: number;
    finishedAt?: number;
  }[] = [];
  const recorded = new Map<import('@playwright/test').Request, (typeof requests)[number]>();
  let activeWorkerRequests = 0;
  let maxWorkerRequests = 0;
  context.on('request', request => {
    const record = {
      path: new URL(request.url()).pathname,
      type: request.resourceType(),
      worker: Boolean(request.serviceWorker()),
      at: Date.now(),
    };
    recorded.set(request, record);
    requests.push(record);
    if (record.worker) {
      activeWorkerRequests += 1;
      maxWorkerRequests = Math.max(maxWorkerRequests, activeWorkerRequests);
    }
  });
  const finish = (request: import('@playwright/test').Request) => {
    const record = recorded.get(request);
    if (!record || record.finishedAt) return;
    record.finishedAt = Date.now();
    if (record.worker) activeWorkerRequests -= 1;
  };
  context.on('requestfinished', finish);
  context.on('requestfailed', finish);
  await page.addInitScript(() => {
    const timings = { readyAt: 0, registerAt: 0, readyWhenRegistered: false };
    Object.assign(window, { __OG_PWA_TIMINGS__: timings });
    window.addEventListener('app-loaded', () => {
      if (
        document.getElementById('root')?.getAttribute('data-app-ready') === 'true' &&
        !timings.readyAt
      ) {
        timings.readyAt = Date.now();
      }
    });
    const original = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    navigator.serviceWorker.register = (...args) => {
      timings.registerAt = Date.now();
      timings.readyWhenRegistered =
        document.getElementById('root')?.getAttribute('data-app-ready') === 'true';
      return original(...args);
    };
  });
  await page.goto('/login');
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toBeVisible();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const timings = await page.evaluate(
    () =>
      (
        window as unknown as {
          __OG_PWA_TIMINGS__: { readyAt: number; registerAt: number; readyWhenRegistered: boolean };
        }
      ).__OG_PWA_TIMINGS__
  );
  expect(timings.readyWhenRegistered).toBe(true);
  expect(timings.registerAt - timings.readyAt).toBeGreaterThanOrEqual(900);
  const cachedPaths = await page.evaluate(async () => {
    const names = await caches.keys();
    const paths: string[] = [];
    for (const name of names.filter(name => name.includes('precache'))) {
      for (const request of await (await caches.open(name)).keys())
        paths.push(new URL(request.url).pathname);
    }
    return paths;
  });
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8')) as Record<
    string,
    { file: string; css?: string[] }
  >;
  const appFiles = [
    ...new Set(Object.values(manifest).flatMap(chunk => [chunk.file, ...(chunk.css || [])])),
  ].filter(file => /\.(?:js|css)$/.test(file));
  for (const file of appFiles) expect(cachedPaths).toContain(`/${file}`);
  expect(cachedPaths).toContain('/app.html');
  expect(cachedPaths).toContain('/index.html');
  if (browserName === 'chromium') {
    expect(requests.filter(request => request.worker).length).toBeGreaterThan(0);
    expect(maxWorkerRequests).toBe(1);
  }
  await testInfo.attach('pwa-request-graph', {
    body: JSON.stringify({ timings, maxWorkerRequests, cachedPaths, requests }, null, 2),
    contentType: 'application/json',
  });
  if (browserName === 'chromium') {
    await context.setOffline(true);
    const response = await page.reload();
    expect(response?.fromServiceWorker()).toBe(true);
    await expect(page.locator('#root')).toHaveAttribute('data-app-ready', 'true');
    await expect(page.getByRole('alertdialog', { name: "You're offline" })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeAttached();
  } else {
    // Playwright WebKit's offline transport rejects navigation before the SW.
    // Cache coverage above remains required; verify controlling SW delivery.
    const response = await page.reload();
    expect(response?.fromServiceWorker()).toBe(true);
    await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toBeVisible();
    await expect(page.locator('#root')).toHaveAttribute('data-app-ready', 'true');
  }
});

test('static root loads without registering a worker or bootstrapping auth', async ({
  page,
  context,
}) => {
  const paths: string[] = [];
  context.on('request', request => paths.push(new URL(request.url()).pathname));
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
  await page.waitForTimeout(1500);
  expect(
    await page.evaluate(() =>
      navigator.serviceWorker.getRegistrations().then(items => items.length)
    )
  ).toBe(0);
  expect(paths.some(path => path === '/sw.js' || path.startsWith('/api/'))).toBe(false);
  expect(await page.locator('#app-bootstrap-resources, script[type="module"]').count()).toBe(0);
});
