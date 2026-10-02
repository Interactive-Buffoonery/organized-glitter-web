import { describe, expect, it } from 'vitest';

import { getKeyboardSafeViewportStyle } from '../useKeyboardSafeViewportStyle';

describe('getKeyboardSafeViewportStyle', () => {
  it('anchors a full-height drawer to the visual viewport when the keyboard shrinks it', () => {
    expect(
      getKeyboardSafeViewportStyle({
        layoutHeight: 800,
        visualHeight: 500,
        offsetTop: 0,
      })
    ).toEqual({
      bottom: '300px',
      height: '500px',
      maxHeight: '500px',
    });
  });

  it('accounts for visual viewport offset when browser chrome changes the usable region', () => {
    expect(
      getKeyboardSafeViewportStyle({
        layoutHeight: 800,
        visualHeight: 460,
        offsetTop: 40,
      })
    ).toEqual({
      bottom: '300px',
      height: '460px',
      maxHeight: '460px',
    });
  });

  it('falls back to dynamic viewport units when visual viewport metrics are unavailable', () => {
    expect(getKeyboardSafeViewportStyle(null)).toEqual({
      bottom: '0px',
      height: '100dvh',
      maxHeight: '100dvh',
    });
  });
});
