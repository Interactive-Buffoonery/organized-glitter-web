import type { Page } from '@playwright/test';

export type ScreenshotMode = 'fullPage' | 'viewport';

const MAX_SAFE_FULL_PAGE_SCREENSHOT_HEIGHT = 30_000;
const MAX_REASONABLE_DOCUMENT_HEIGHT = 120_000;
const MAX_SAFE_EXPANDED_VIEWPORT_HEIGHT = 30_000;

const MOBILE_PROJECT_PATTERN = /mobile/i;

interface ChooseScreenshotModeInput {
  projectName: string;
  documentHeight: number;
  deviceScaleFactor?: number;
}

interface AssertReasonableDocumentHeightInput {
  screenTitle: string;
  documentHeight: number;
}

interface CaptureScreenReviewScreenshotInput {
  page: Page;
  path: string;
  projectName: string;
  screenTitle: string;
}

export const chooseScreenshotMode = ({
  projectName,
  documentHeight,
  deviceScaleFactor = 1,
}: ChooseScreenshotModeInput): ScreenshotMode => {
  const bitmapHeight = documentHeight * deviceScaleFactor;

  if (
    MOBILE_PROJECT_PATTERN.test(projectName) &&
    bitmapHeight > MAX_SAFE_FULL_PAGE_SCREENSHOT_HEIGHT
  ) {
    return 'viewport';
  }

  return 'fullPage';
};

export const assertReasonableDocumentHeight = ({
  screenTitle,
  documentHeight,
}: AssertReasonableDocumentHeightInput) => {
  if (documentHeight > MAX_REASONABLE_DOCUMENT_HEIGHT) {
    throw new Error(
      `${screenTitle} is unreasonably tall (${documentHeight}px). ` +
        'This likely indicates a runaway document-height/layout regression.'
    );
  }
};

const getDocumentScreenshotHeight = async (page: Page) =>
  page.evaluate(() => {
    const scrollingElement = document.scrollingElement ?? document.documentElement;

    return Math.max(
      scrollingElement.scrollHeight,
      document.documentElement.scrollHeight,
      document.body?.scrollHeight ?? 0,
      window.innerHeight
    );
  });

const getDeviceScaleFactor = async (page: Page) =>
  page.evaluate(() => window.devicePixelRatio || 1);

export const captureScreenReviewScreenshot = async ({
  page,
  path,
  projectName,
  screenTitle,
}: CaptureScreenReviewScreenshotInput) => {
  const documentHeight = await getDocumentScreenshotHeight(page);
  const deviceScaleFactor = await getDeviceScaleFactor(page);

  assertReasonableDocumentHeight({ screenTitle, documentHeight });

  const mode = chooseScreenshotMode({ projectName, documentHeight, deviceScaleFactor });
  const viewport = page.viewportSize();
  const canExpandViewport =
    mode === 'fullPage' &&
    viewport !== null &&
    documentHeight > viewport.height &&
    documentHeight <= MAX_SAFE_EXPANDED_VIEWPORT_HEIGHT;
  let viewportIsExpanded = false;
  try {
    if (canExpandViewport) {
      await page.setViewportSize({ width: viewport.width, height: documentHeight });
      viewportIsExpanded = true;
      const expandedDocumentHeight = await getDocumentScreenshotHeight(page);
      if (expandedDocumentHeight > documentHeight + 1) {
        await page.setViewportSize(viewport);
        viewportIsExpanded = false;
      }
    }

    await page.screenshot({
      path,
      fullPage: mode === 'fullPage' && !viewportIsExpanded,
      animations: 'disabled',
    });
  } finally {
    if (viewportIsExpanded) {
      await page.setViewportSize(viewport);
    }
  }

  return { mode, documentHeight, deviceScaleFactor };
};
