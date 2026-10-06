import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

import {
  builtIndexPath,
  MAX_RESOURCE_REQUESTS,
  QUIET_PERIOD,
  RECOVERY_TIMEOUT,
  test,
  type ColdLoad,
} from './fixtures/cold-load';

async function expectLogin(page: Page) {
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toBeVisible({
    timeout: RECOVERY_TIMEOUT,
  });
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await expect(page.locator('#root')).toHaveAttribute('data-app-ready', 'true');
  await expect(page.locator('#root')).not.toHaveAttribute('inert', '');
  await expect(page.locator('#root')).toHaveCSS('opacity', '1');
  await expect(page.locator('#app-loading')).not.toBeVisible();
  await expect(page.locator('#app-error')).not.toBeVisible();
}

async function expectRecovery(page: Page) {
  const recovery = page.locator('#app-error');
  await expect(recovery).toBeVisible({ timeout: RECOVERY_TIMEOUT });
  await expect(recovery).toHaveAttribute('role', 'alert');
  await expect(recovery).not.toHaveAttribute('aria-hidden', 'true');
  await expect(recovery.getByRole('heading')).toBeVisible();
  const retry = recovery.getByRole('button', { name: /try again/i });
  await expect(retry).toBeVisible();
  await expect(retry).toBeEnabled();
  await expect(page.locator('#root')).toHaveAttribute('inert', '');
  await expect(page.locator('#app-loading')).not.toBeVisible();
  return retry;
}

async function expectUsefulLanding(page: Page) {
  const main = page.getByRole('main');
  await expect(
    main.getByRole('heading', { level: 1, name: /coloring books.*diamond art/i })
  ).toBeVisible();
  await expect(main).toContainText(/track/i);
  await expect(page.getByRole('link', { name: /login|sign in/i }).first()).toBeVisible();
  await expect(
    page.getByRole('link', { name: /start tracking|get started/i }).first()
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /^privacy(?: policy)?$/i }).first()).toHaveAttribute(
    'href',
    '/privacy'
  );
  await expect(
    page.getByRole('link', { name: /^terms(?: of (?:service|use))?$/i }).first()
  ).toHaveAttribute('href', '/terms');
  await expect(page.locator('#app-loading')).not.toBeVisible();
  await expect(page.locator('#app-error')).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function expectResourceQuiet(page: Page, coldLoad: ColdLoad, path: string) {
  const resources = coldLoad.requestsFor(path).length;
  const documents = coldLoad.documents.length;
  await page.waitForTimeout(QUIET_PERIOD);
  expect(coldLoad.requestsFor(path)).toHaveLength(resources);
  expect(coldLoad.documents).toHaveLength(documents);
  expect(resources).toBeLessThanOrEqual(MAX_RESOURCE_REQUESTS);
  expect(documents).toBeLessThanOrEqual(4);
}

test('clean built login becomes interactive without auth, cache, or a service worker', async ({
  page,
  context,
  coldLoad,
}) => {
  await page.goto('/login');
  await expectLogin(page);
  expect(
    coldLoad.requestsFor(coldLoad.assets.entry).some(request => request.type === 'script')
  ).toBe(true);
  expect(context.serviceWorkers()).toHaveLength(0);
  expect(
    (await context.storageState()).origins
      .flatMap(origin => origin.localStorage)
      .some(item => item.name === 'pocketbase_auth')
  ).toBe(false);
  expect(await page.evaluate(() => caches.keys())).toEqual([]);
  expect(await page.evaluate(() => navigator.serviceWorker.controller === null)).toBe(true);
});

for (const target of ['entry', 'dependency'] as const) {
  test(`one ${target} 429 recovers automatically and honors Retry-After`, async ({
    page,
    coldLoad,
  }) => {
    const path = coldLoad.assets[target];
    coldLoad.fault = { path, status: 429, failures: 1, retryAfter: '1' };
    await page.goto(`/login?cold_load=${target}#sign-in`);
    await expectLogin(page);
    await expect(page).toHaveURL(new RegExp(`/login\\?cold_load=${target}#sign-in$`));
    const requests = coldLoad.requestsFor(path);
    expect(requests.filter(request => request.injectedStatus === 429)).toHaveLength(1);
    expect(requests.length).toBeGreaterThan(1);
    const executionRetry = requests.find(
      request => request.type === 'script' && request.status === 200
    );
    expect(executionRetry, 'a status probe alone cannot recover the failed module').toBeDefined();
    expect(
      executionRetry!.at - requests[0].at,
      'Retry-After must prevent an immediate retry storm'
    ).toBeGreaterThanOrEqual(900);
    await expectResourceQuiet(page, coldLoad, path);
  });

  test(`persistent ${target} 429 exhausts automatic recovery and leaves keyboard Retry`, async ({
    page,
    coldLoad,
    isMobile,
  }) => {
    const path = coldLoad.assets[target];
    coldLoad.fault = { path, status: 429, retryAfter: '1' };
    await page.goto(`/login?cold_load=persistent-${target}`);
    const retry = await expectRecovery(page);
    await expectResourceQuiet(page, coldLoad, path);
    expect(
      coldLoad.requestsFor(path).length,
      'transient failures must get a bounded automatic retry'
    ).toBeGreaterThan(1);
    await expect(page).toHaveURL(new RegExp(`/login\\?cold_load=persistent-${target}$`));
    if (!isMobile) await expect(retry).toBeFocused();
    const scan = await new AxeBuilder({ page })
      .include('#app-error')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(scan.violations).toEqual([]);
    coldLoad.fault = undefined;
    if (isMobile) await retry.click();
    else await page.keyboard.press('Enter');
    await expectLogin(page);
    await expect(page).toHaveURL(new RegExp(`/login\\?cold_load=persistent-${target}$`));
  });

  test(`permanent ${target} 404 shows recovery without endless retries`, async ({
    page,
    coldLoad,
  }) => {
    const path = coldLoad.assets[target];
    coldLoad.fault = { path, status: 404 };
    await page.goto('/login?cold_load=missing');
    await expectRecovery(page);
    await expectResourceQuiet(page, coldLoad, path);
    expect(coldLoad.requestsFor(path).length).toBeGreaterThan(0);
    expect(
      coldLoad.requestsFor(path).length,
      'a permanent 404 must not spend the transient retry budget'
    ).toBeLessThanOrEqual(2);
    expect(coldLoad.documents).toHaveLength(1);
  });
}

test('Retry-After HTTP date delays recovery until the dependency is available', async ({
  page,
  coldLoad,
}) => {
  const path = coldLoad.assets.dependency;
  coldLoad.fault = {
    path,
    status: 429,
    retryAfterDateMs: 2_000,
  };
  await page.goto('/login?cold_load=http-date');
  await expectLogin(page);
  const requests = coldLoad.requestsFor(path);
  expect(requests[0].injectedStatus).toBe(429);
  expect(requests.length).toBeGreaterThan(1);
  const diagnosticProbe = requests.findIndex(
    request => request.type !== 'script' && request.injectedStatus === 429
  );
  const retryIndex = diagnosticProbe < 0 ? 1 : diagnosticProbe + 1;
  expect(requests[retryIndex], 'a retry must follow the rate-limit diagnostic').toBeDefined();
  expect(requests[retryIndex].at).toBeGreaterThanOrEqual(coldLoad.fault.blockedUntil! - 100);
  await expectResourceQuiet(page, coldLoad, path);
});

test('initial app CSS 429 recovers before the login form is usable', async ({ page, coldLoad }) => {
  const path = coldLoad.assets.css[0];
  coldLoad.fault = { path, status: 429, failures: 1, retryAfter: '1' };
  await page.goto('/login?cold_load=css');
  await expectLogin(page);
  const requests = coldLoad.requestsFor(path);
  expect(requests[0].injectedStatus).toBe(429);
  await expect.poll(() => coldLoad.requestsFor(path).length).toBeGreaterThan(1);
  await expect
    .poll(() =>
      coldLoad
        .requestsFor(path)
        .some(request => request.type === 'stylesheet' && request.status === 200)
    )
    .toBe(true);
  const stylesheetRetry = coldLoad
    .requestsFor(path)
    .find(request => request.type === 'stylesheet' && request.status === 200);
  expect(stylesheetRetry!.at - requests[0].at).toBeGreaterThanOrEqual(900);
  expect(
    await page.evaluate(
      path =>
        Array.from(document.styleSheets).some(
          sheet =>
            sheet.href &&
            new URL(sheet.href).pathname === path &&
            !sheet.disabled &&
            sheet.cssRules.length > 0
        ),
      path
    )
  ).toBe(true);
  await expectResourceQuiet(page, coldLoad, path);
});

test.describe('static public landing', () => {
  test('built HTML contains useful content and semantic actions before scripts run', async ({
    request,
    coldLoad,
  }) => {
    const response = await request.get('/');
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toMatch(/<h1\b[^>]*>[\s\S]*?coloring books[\s\S]*?diamond art[\s\S]*?<\/h1>/i);
    expect(html).toMatch(/<main\b/);
    expect(html).toMatch(/<a\b[^>]*href=["']\/login["']/);
    expect(html).toMatch(/<a\b[^>]*href=["']\/register["']/);
    expect(html).toMatch(/<a\b[^>]*href=["']\/privacy["']/);
    expect(html).toMatch(/<a\b[^>]*href=["']\/terms["']/);
    expect(await readFile(builtIndexPath, 'utf8')).not.toContain(coldLoad.assets.entry);
  });

  test('blocked SPA bundles leave the landing useful and public links reachable', async ({
    page,
    coldLoad,
    isMobile,
  }) => {
    coldLoad.blockAppModules = true;
    await page.goto('/?cold_load=blocked-spa');
    await expectUsefulLanding(page);
    expect(
      coldLoad.appModules,
      'the public landing must not request the app module graph'
    ).toHaveLength(0);
    const login = page.getByRole('link', { name: /login|sign in/i }).first();
    await expect(login).toHaveAttribute('href', '/login');
    coldLoad.blockAppModules = false;
    if (isMobile) await login.click();
    else {
      await login.focus();
      await expect(login).toBeFocused();
      await page.keyboard.press('Enter');
    }
    await expect(page).toHaveURL(/\/login$/);
    await expectLogin(page);
  });

  test('the landing has accessible actions and reaches the real SPA login', async ({
    page,
    coldLoad,
  }) => {
    await page.goto('/');
    await expectUsefulLanding(page);
    expect(coldLoad.appModules).toHaveLength(0);
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(scan.violations).toEqual([]);
    await page
      .getByRole('link', { name: /login|sign in/i })
      .first()
      .click();
    await expectLogin(page);
    expect(coldLoad.requestsFor(coldLoad.assets.entry).length).toBeGreaterThan(0);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`${colorScheme} landing remains useful with navigation to public pages and auth`, async ({
      page,
      coldLoad,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto('/');
      await expectUsefulLanding(page);
      expect(coldLoad.appModules).toHaveLength(0);
      const privacy = page.getByRole('link', { name: /^privacy(?: policy)?$/i }).first();
      await privacy.click();
      await expect(page).toHaveURL(/\/privacy$/);
      await expect(
        page.getByRole('main').getByRole('heading', { level: 1, name: /privacy/i })
      ).toBeVisible();
      await page.goto('/');
      await page
        .getByRole('link', { name: /login|sign in/i })
        .first()
        .click();
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByText(/javascript/i).first()).toBeVisible();
    });
  }
});

test('manual Retry from a failed entry is accessible and reaches the real login', async ({
  page,
  coldLoad,
  isMobile,
}) => {
  coldLoad.fault = { path: coldLoad.assets.entry, status: 404 };
  await page.goto('/login?cold_load=manual-retry#sign-in');
  const retry = await expectRecovery(page);
  if (!isMobile) await expect(retry).toBeFocused();
  const scan = await new AxeBuilder({ page })
    .include('#app-error')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect.soft(scan.violations).toEqual([]);
  coldLoad.fault = undefined;
  if (isMobile) await retry.click();
  else await page.keyboard.press('Enter');
  await expectLogin(page);
  await expect(page).toHaveURL(/\/login\?cold_load=manual-retry#sign-in$/);
});

for (const path of ['/dashboard', '/projects/new', '/coloring', '/profile']) {
  test(`${path} still serves the SPA and protects the route in a clean context`, async ({
    page,
    coldLoad,
  }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/login(?:[?#].*)?$/);
    await expectLogin(page);
    expect(
      coldLoad.requestsFor(coldLoad.assets.entry).some(request => request.type === 'script')
    ).toBe(true);
    await expect(
      page.getByRole('heading', { level: 1, name: /organize your coloring/i })
    ).toHaveCount(0);
  });
}
