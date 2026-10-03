import { describe, expect, it } from 'vitest';

import {
  assertReasonableDocumentHeight,
  chooseScreenshotMode,
} from '../e2e/screen-review/screenshot';

describe('chooseScreenshotMode', () => {
  it('uses full page screenshots for desktop projects', () => {
    expect(
      chooseScreenshotMode({
        projectName: 'screen-review-desktop',
        documentHeight: 50_000,
      })
    ).toBe('fullPage');
  });

  it('uses full page screenshots for mobile pages under the safe scaled height', () => {
    expect(
      chooseScreenshotMode({
        projectName: 'screen-review-mobile-safari',
        documentHeight: 9_000,
        deviceScaleFactor: 3,
      })
    ).toBe('fullPage');
  });

  it('uses viewport screenshots for mobile pages whose scaled bitmap height would exceed the safe height', () => {
    expect(
      chooseScreenshotMode({
        projectName: 'screen-review-mobile-safari',
        documentHeight: 12_000,
        deviceScaleFactor: 3,
      })
    ).toBe('viewport');
  });

  it('uses viewport screenshots for mobile pages over the safe height', () => {
    expect(
      chooseScreenshotMode({
        projectName: 'screen-review-mobile-safari',
        documentHeight: 40_000,
      })
    ).toBe('viewport');
  });
});

describe('assertReasonableDocumentHeight', () => {
  it('allows long but reasonable document heights', () => {
    expect(() =>
      assertReasonableDocumentHeight({
        screenTitle: 'Dashboard: coloring books',
        documentHeight: 80_000,
      })
    ).not.toThrow();
  });

  it('throws for runaway document heights', () => {
    expect(() =>
      assertReasonableDocumentHeight({
        screenTitle: 'Dashboard: coloring books',
        documentHeight: 150_000,
      })
    ).toThrow(/unreasonably tall/i);
  });
});
