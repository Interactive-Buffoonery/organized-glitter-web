import { describe, expect, it } from 'vitest';

import { themeColorFromCss } from '../contrast';

describe('themeColorFromCss', () => {
  it('reads theme selectors regardless of comments or theme order', () => {
    const css = `
      /* Berry Cream after dark */
      .other { --link: 120 100% 50%; }
      .dark, [data-theme='dark'] { --link: 240 100% 50%; }
      /* renamed theme heading */
      :root, [data-theme='light'] { --link: 0 100% 50%; }
    `;

    expect(themeColorFromCss(css, 'light', 'link')).toEqual([1, 0, 0]);
    expect(themeColorFromCss(css, 'dark', 'link')).toEqual([0, 0, 1]);
    expect(() => themeColorFromCss(css, 'light', 'card')).toThrow('Missing light --card');
  });
});
