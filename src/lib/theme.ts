export const THEME_STORAGE_KEY = 'theme';

export const APP_THEMES = ['system', 'light', 'dark'] as const;

export type AppTheme = (typeof APP_THEMES)[number];

export const DEFAULT_THEME: AppTheme = 'system';

export const THEME_OPTIONS: ReadonlyArray<{ value: AppTheme; label: string; description: string }> =
  [
    {
      value: 'system',
      label: 'System',
      description: "Follow this device's light or dark appearance.",
    },
    {
      value: 'light',
      label: 'Light',
      description: 'Use the bright Berry Cream palette.',
    },
    {
      value: 'dark',
      label: 'Dark',
      description: 'Use the Berry Cream after dark palette.',
    },
  ];

export type ThemeColorScheme = 'light' | 'dark';

export function isAppTheme(value: unknown): value is AppTheme {
  return typeof value === 'string' && (APP_THEMES as readonly string[]).includes(value);
}

export function resolveThemePreference(value: unknown): AppTheme {
  if (value === 'catppuccin-latte') return 'light';
  if (
    value === 'catppuccin-frappe' ||
    value === 'catppuccin-macchiato' ||
    value === 'catppuccin-mocha'
  ) {
    return 'dark';
  }

  return isAppTheme(value) ? value : DEFAULT_THEME;
}

export function isDarkLikeTheme(theme: AppTheme): boolean {
  return theme === 'dark';
}

export function getThemeColorScheme(
  theme: AppTheme,
  resolvedTheme?: string | null,
  systemPrefersDark = false
): ThemeColorScheme {
  if (theme === 'system') {
    if (resolvedTheme === 'dark') return 'dark';
    if (resolvedTheme === 'light') return 'light';
    return systemPrefersDark ? 'dark' : 'light';
  }

  return isDarkLikeTheme(theme) ? 'dark' : 'light';
}

export function getThemeLabel(theme: AppTheme): string {
  return THEME_OPTIONS.find(option => option.value === theme)?.label ?? 'System';
}
