import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

import {
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

for (const target of ['entry'] as const) {
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
