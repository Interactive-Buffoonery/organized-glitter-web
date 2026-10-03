import { describe, expect, it } from 'vitest';

import {
  APP_THEMES,
  DEFAULT_THEME,
  THEME_OPTIONS,
  getThemeColorScheme,
  isAppTheme,
  isDarkLikeTheme,
  resolveThemePreference,
} from '@/lib/theme';

describe('theme model', () => {
  it('recognizes every supported theme value', () => {
    expect(APP_THEMES).toEqual(['system', 'light', 'dark']);

    APP_THEMES.forEach(theme => {
      expect(isAppTheme(theme)).toBe(true);
    });
  });

  it('rejects unknown theme values', () => {
    expect(isAppTheme('catppuccin')).toBe(false);
    expect(isAppTheme('mocha')).toBe(false);
    expect(isAppTheme(undefined)).toBe(false);
  });

  it('falls back to the default theme for invalid values', () => {
    expect(DEFAULT_THEME).toBe('system');
    expect(resolveThemePreference('unknown')).toBe('system');
    expect(resolveThemePreference(null)).toBe('system');
  });

  it('migrates legacy Catppuccin preferences to light or dark', () => {
    expect(resolveThemePreference('catppuccin-latte')).toBe('light');
    expect(resolveThemePreference('catppuccin-frappe')).toBe('dark');
    expect(resolveThemePreference('catppuccin-macchiato')).toBe('dark');
    expect(resolveThemePreference('catppuccin-mocha')).toBe('dark');
  });

  it('describes dark as Berry Cream after dark', () => {
    expect(THEME_OPTIONS.find(option => option.value === 'dark')?.description).toMatch(
      /Berry Cream after dark/i
    );
    expect(THEME_OPTIONS.find(option => option.value === 'dark')?.description).not.toMatch(
      /Catppuccin/i
    );
  });

  it('maps dark mode for Tailwind dark utilities', () => {
    expect(isDarkLikeTheme('light')).toBe(false);
    expect(isDarkLikeTheme('dark')).toBe(true);
  });

  it('maps every app theme to a light or dark color scheme for external libraries', () => {
    expect(getThemeColorScheme('system', 'light')).toBe('light');
    expect(getThemeColorScheme('system', 'dark')).toBe('dark');
    expect(getThemeColorScheme('system')).toBe('light');
    expect(getThemeColorScheme('light')).toBe('light');
    expect(getThemeColorScheme('dark')).toBe('dark');

    APP_THEMES.forEach(theme => {
      expect(['light', 'dark']).toContain(getThemeColorScheme(theme, 'dark'));
    });
  });

  it('uses the system appearance when next-themes hydrates an unknown resolved theme', () => {
    expect(getThemeColorScheme('system', 'not-a-theme', true)).toBe('dark');
    expect(getThemeColorScheme('system', 'not-a-theme', false)).toBe('light');
    expect(getThemeColorScheme('system', undefined, true)).toBe('dark');
  });
});
