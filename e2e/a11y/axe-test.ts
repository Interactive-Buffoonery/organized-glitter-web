import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';

export { requireFixtureOrSkip } from '../fixtures/local-safety';

const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const;

interface AxeScanOptions {
  include?: string | string[];
  disableRules?: string[];
}

export const isAppRootOpaque = () => {
  const root = document.getElementById('root');
  if (root) return Number.parseFloat(getComputedStyle(root).opacity) >= 0.999;
  const staticPage = document.querySelector<HTMLElement>(
    '[data-static-page], [data-static-landing]'
  );
  if (!staticPage?.querySelector('main#main-content')) return false;
  const style = getComputedStyle(staticPage);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    Number.parseFloat(style.opacity || '1') >= 0.999
  );
};

export async function waitForAccessibilityScanReady(page: Page) {
  await page.locator('#app-loading').waitFor({ state: 'detached', timeout: 20_000 });
  await page.waitForFunction(isAppRootOpaque, null, { timeout: 20_000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

export async function createAxeBuilder(page: Page, options: AxeScanOptions = {}) {
  await waitForAccessibilityScanReady(page);

  const builder = new AxeBuilder({ page }).withTags([...wcagTags]).exclude('#app-loading');

  const includes = Array.isArray(options.include)
    ? options.include
    : options.include
      ? [options.include]
      : [];

  includes.forEach(selector => builder.include(selector));

  if (options.disableRules?.length) {
    builder.disableRules(options.disableRules);
  }

  return builder;
}

export async function expectNoAxeViolations(page: Page, options: AxeScanOptions = {}) {
  const builder = await createAxeBuilder(page, options);
  const accessibilityScanResults = await builder.analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
}

export async function expectNoStructuralAxeViolations(page: Page, options: AxeScanOptions = {}) {
  await expectNoAxeViolations(page, {
    ...options,
    disableRules: [...(options.disableRules ?? []), 'color-contrast'],
  });
}

export async function waitForAnyVisible(locators: Locator[], timeout: number) {
  const result = await Promise.any(
    locators.map(async locator => {
      await locator.waitFor({ state: 'visible', timeout });
      return locator;
    })
  ).catch((error: unknown) => error);

  if (result instanceof Error) {
    throw result;
  }
}

export const pressEscape = async (page: Page) => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
};
