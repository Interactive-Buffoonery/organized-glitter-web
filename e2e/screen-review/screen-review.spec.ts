import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertNoHorizontalOverflow,
  assertScreenClean,
  captureConsole,
  waitForScreenshotReady,
} from './assertions';
import { screenInventory } from './inventory';
import { captureScreenReviewScreenshot } from './screenshot';

const rootDir = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const reviewDir = path.join(rootDir, 'playwright-artifacts', 'screen-review');

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

test.describe('screen review atlas', () => {
  for (const screen of screenInventory) {
    test(`${screen.id} renders for review`, async ({ page }, testInfo) => {
      const projectName = slug(testInfo.project.name);
      const capture = captureConsole(page);
      const pathOrResolver = screen.path;
      const resolvedPath =
        typeof pathOrResolver === 'function' ? await pathOrResolver(page) : pathOrResolver;

      if (!resolvedPath) {
        test.skip(true, `${screen.title} has no fixture data available.`);
      }

      await page.goto(resolvedPath);
      await expect(screen.ready(page)).toBeVisible({ timeout: 15_000 });
      await waitForScreenshotReady(page, screen.title);

      const screenshotRelativePath = path.join('screens', projectName, `${screen.id}.png`);
      const screenshotPath = path.join(reviewDir, screenshotRelativePath);
      await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
      const screenshotCapture = await captureScreenReviewScreenshot({
        page,
        path: screenshotPath,
        projectName: testInfo.project.name,
        screenTitle: screen.title,
      });

      const result = {
        id: screen.id,
        title: screen.title,
        review: screen.review,
        projectName: testInfo.project.name,
        path: resolvedPath,
        screenshot: screenshotRelativePath,
        screenshotMode: screenshotCapture.mode,
        documentHeight: screenshotCapture.documentHeight,
        deviceScaleFactor: screenshotCapture.deviceScaleFactor,
        notes: screen.notes ?? '',
        capturedAt: new Date().toISOString(),
      };

      const resultPath = path.join(reviewDir, 'results', projectName, `${screen.id}.json`);
      await fs.mkdir(path.dirname(resultPath), { recursive: true });
      await fs.writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);

      await assertScreenClean(page, capture, `${screen.title} (${resolvedPath})`);

      if (testInfo.project.name.toLowerCase().includes('mobile')) {
        await assertNoHorizontalOverflow(page, screen.title);
      }
    });
  }
});
