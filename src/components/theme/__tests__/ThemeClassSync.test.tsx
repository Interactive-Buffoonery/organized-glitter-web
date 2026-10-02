import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeClassSync } from '../ThemeClassSync';

const state = vi.hoisted(() => ({
  theme: 'system' as string | undefined,
  resolvedTheme: 'light' as string | undefined,
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: state.theme, resolvedTheme: state.resolvedTheme }),
}));

const stubMatchMedia = (prefersDark: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: prefersDark && query.includes('prefers-color-scheme: dark'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
};

describe('ThemeClassSync', () => {
  beforeEach(() => {
    state.theme = 'system';
    state.resolvedTheme = 'light';
    document.documentElement.classList.remove('dark');
    stubMatchMedia(false);
  });

  afterEach(() => {
    document.documentElement.classList.remove('dark');
  });

  it('keeps dark-system visitors on dark when next-themes hydrates an unknown stored theme', () => {
    state.theme = 'not-a-theme';
    state.resolvedTheme = 'not-a-theme';
    stubMatchMedia(true);

    render(<ThemeClassSync />);

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('does not force dark when an unknown stored theme hydrates on a light system', () => {
    state.theme = 'not-a-theme';
    state.resolvedTheme = 'not-a-theme';
    stubMatchMedia(false);

    render(<ThemeClassSync />);

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
