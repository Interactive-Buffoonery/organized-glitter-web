import { expect, type Locator, type Page } from '@playwright/test';

const PACE_MS = 15_000;
const NAVIGATION_BUDGET_MS = 15_000;
const ROUTE_LOAD_BUDGET_MS = 15_000;
const SETTLE_MS = 1_000;
const INTERACTION_BUDGET_MS = 30_000;

export const pacedTestTimeout = (visits: number) =>
  visits * (PACE_MS + NAVIGATION_BUDGET_MS + ROUTE_LOAD_BUDGET_MS + SETTLE_MS) +
  INTERACTION_BUDGET_MS;

export const createPacedVisit = (page: Page, { initialPause = false } = {}) => {
  const host = new URL(process.env.E2E_APP_URL!).host;
  const failedPaths: string[] = [];
  let hasVisited = false;

  page.on('response', response => {
    const url = new URL(response.url());
    if (url.host === host && (response.status() === 429 || response.status() >= 500)) {
      failedPaths.push(`${response.status()} ${url.pathname}`);
    }
  });

  return async (path: string, ready: Locator) => {
    if (hasVisited || initialPause) await page.waitForTimeout(PACE_MS);
    hasVisited = true;

    const response = await page.goto(path);
    expect(response?.status(), `Document failed on ${path}`).toBe(200);
    try {
      await expect(ready).toBeVisible({ timeout: 15_000 });
    } catch (error) {
      const failures = failedPaths.splice(0);
      if (failures.length) {
        throw new Error(`Spacefast responses while loading ${path}: ${failures.join(', ')}`);
      }
      throw error;
    }
    await page.waitForTimeout(SETTLE_MS);
    expect(failedPaths.splice(0), `Spacefast failed to serve ${path}`).toEqual([]);
  };
};
