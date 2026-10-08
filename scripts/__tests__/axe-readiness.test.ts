import { afterEach, describe, expect, it, vi } from 'vitest';

import { isAppRootOpaque, waitForAccessibilityScanReady } from '../../e2e/a11y/axe-test';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('axe scan readiness', () => {
  it('does not consider the app ready while the root is still fading in', () => {
    document.body.innerHTML = '<div id="root" style="opacity: 0.5"></div>';
    expect(isAppRootOpaque()).toBe(false);

    document.getElementById('root')?.style.setProperty('opacity', '1');
    expect(isAppRootOpaque()).toBe(true);
  });

  it('accepts an explicit opaque static page without manufacturing React readiness', () => {
    document.body.innerHTML =
      '<div data-static-landing style="opacity: 1"><main id="main-content">Home</main></div>';
    expect(isAppRootOpaque()).toBe(true);
    expect(document.querySelector('[data-app-ready]')).toBeNull();
    document.querySelector('[data-static-landing]')?.setAttribute('style', 'opacity: 0.5');
    expect(isAppRootOpaque()).toBe(false);
  });

  it('accepts visible static legal pages and rejects hidden content', () => {
    document.body.innerHTML =
      '<div data-static-page><main id="main-content">Privacy policy</main></div>';
    expect(isAppRootOpaque()).toBe(true);
    const page = document.querySelector<HTMLElement>('[data-static-page]')!;
    page.style.visibility = 'hidden';
    expect(isAppRootOpaque()).toBe(false);
    page.style.visibility = 'visible';
    page.style.display = 'none';
    expect(isAppRootOpaque()).toBe(false);
  });

  it('rejects absent roots and incomplete static markup', () => {
    expect(isAppRootOpaque()).toBe(false);
    document.body.innerHTML = '<div data-static-landing style="opacity: 1"></div>';
    expect(isAppRootOpaque()).toBe(false);
  });

  it('does not settle fonts and layout until both startup transitions finish', async () => {
    let finishSplash: () => void = () => undefined;
    let finishRootFade: () => void = () => undefined;
    const splashDetached = new Promise<void>(resolve => {
      finishSplash = resolve;
    });
    const rootOpaque = new Promise<void>(resolve => {
      finishRootFade = resolve;
    });
    const waitFor = vi.fn(() => splashDetached);
    const page = {
      locator: vi.fn(() => ({ waitFor })),
      waitForFunction: vi.fn(() => rootOpaque),
      evaluate: vi.fn().mockResolvedValue(undefined),
    };

    const readiness = waitForAccessibilityScanReady(page as never);
    await Promise.resolve();
    expect(page.waitForFunction).not.toHaveBeenCalled();
    expect(page.evaluate).not.toHaveBeenCalled();

    finishSplash();
    await Promise.resolve();
    expect(page.waitForFunction).toHaveBeenCalledOnce();
    expect(page.evaluate).not.toHaveBeenCalled();

    finishRootFade();
    await readiness;
    expect(page.evaluate).toHaveBeenCalledOnce();
  });
});
