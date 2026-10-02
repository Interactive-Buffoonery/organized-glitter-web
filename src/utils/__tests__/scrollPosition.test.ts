import { afterEach, describe, expect, it, vi } from 'vitest';

import { getPageScrollY, restorePageScrollY } from '../scrollPosition';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('scrollPosition utilities', () => {
  it('reads the document page scroll position from window.scrollY first', () => {
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(125);
    Object.defineProperty(document.documentElement, 'scrollTop', {
      configurable: true,
      value: 42,
    });

    expect(getPageScrollY()).toBe(125);
  });

  it('falls back to document scroll offsets when window.scrollY is unavailable', () => {
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(0);
    Object.defineProperty(document.documentElement, 'scrollTop', {
      configurable: true,
      value: 88,
    });

    expect(getPageScrollY()).toBe(88);
  });

  it('restores document page scroll through window.scrollTo', () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

    restorePageScrollY(320, 'smooth');

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 320, behavior: 'smooth' });
  });
});
