import { expect, type ConsoleMessage, type Page } from '@playwright/test';

const IGNORABLE_CONSOLE_PATTERNS: RegExp[] = [
  /us\.i\.posthog\.com/,
  /ERR_CONNECTION_REFUSED.*posthog/i,
  /^Failed to load resource: net::ERR_NETWORK_CHANGED$/,
  /Failed to load resource.*posthog/i,
  /User attempted to access non-existent route/,
  /\[ColoringTagService\]\s+Error loading coloring tags: .*ClientResponseError 0:/s,
  /\[QueryClient\]\s+Unknown error - allowing retry:/,
];

const RENDER_LOOP_PATTERNS: RegExp[] = [/Maximum update depth exceeded/, /Too many re-renders/];
const ERROR_BOUNDARY_HEADLINE = /something went wrong/i;
const ERROR_BOUNDARY_BODY = /there was an error loading/i;

interface ConsoleCapture {
  errors: string[];
  loopMatches: string[];
}

export const captureConsole = (page: Page): ConsoleCapture => {
  const errors: string[] = [];
  const loopMatches: string[] = [];

  page.on('console', (msg: ConsoleMessage) => {
    const text = msg.text();
    if (RENDER_LOOP_PATTERNS.some(pattern => pattern.test(text))) {
      loopMatches.push(text);
    }
    if (msg.type() === 'error') {
      errors.push(text);
    }
  });

  page.on('pageerror', (err: Error) => {
    if (RENDER_LOOP_PATTERNS.some(pattern => pattern.test(err.message))) {
      loopMatches.push(`pageerror: ${err.message}`);
    }
    errors.push(`pageerror: ${err.message}`);
  });

  return { errors, loopMatches };
};

export const assertScreenClean = async (page: Page, capture: ConsoleCapture, label: string) => {
  expect(
    capture.loopMatches,
    `Render-loop signature detected on ${label}:\n${capture.loopMatches.join('\n')}`
  ).toHaveLength(0);

  const visibleText = await page.locator('body').innerText();
  expect(visibleText, `Error boundary headline is visible on ${label}`).not.toMatch(
    ERROR_BOUNDARY_HEADLINE
  );
  expect(visibleText, `Error boundary body text is visible on ${label}`).not.toMatch(
    ERROR_BOUNDARY_BODY
  );

  const realErrors = capture.errors.filter(
    text => !IGNORABLE_CONSOLE_PATTERNS.some(pattern => pattern.test(text))
  );
  expect(
    realErrors,
    `Unexpected console errors on ${label}:\n${realErrors.join('\n')}`
  ).toHaveLength(0);
};

export const assertNoHorizontalOverflow = async (page: Page, label: string) => {
  const overflow = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return {
      body: document.body.scrollWidth,
      root: root.scrollWidth,
      viewport: window.innerWidth,
    };
  });

  expect(
    Math.max(overflow.body, overflow.root),
    `${label} should not overflow horizontally: ${JSON.stringify(overflow)}`
  ).toBeLessThanOrEqual(overflow.viewport + 1);
};

export const waitForScreenshotReady = async (page: Page, label: string) => {
  await page.waitForFunction(
    () => {
      const loading = document.getElementById('app-loading');
      if (!loading) return true;

      const styles = window.getComputedStyle(loading);
      return (
        styles.display === 'none' || styles.visibility === 'hidden' || Number(styles.opacity) === 0
      );
    },
    null,
    { timeout: 20_000 }
  );

  await page.waitForFunction(
    () => !document.body.innerText.includes('Getting your collection ready...'),
    null,
    { timeout: 20_000 }
  );

  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });

  const visibleText = await page.locator('body').innerText();
  expect(visibleText, `${label} should not capture the pre-React loading shell`).not.toContain(
    'Getting your collection ready...'
  );
};
