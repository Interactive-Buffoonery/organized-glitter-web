import { useEffect } from 'react';
import { useTheme } from 'next-themes';

import { getThemeColorScheme, resolveThemePreference } from '@/lib/theme';

export function ThemeClassSync() {
  const { theme, resolvedTheme } = useTheme();

  useEffect(() => {
    const root = document.documentElement;
    const selectedTheme = resolveThemePreference(theme);
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = getThemeColorScheme(selectedTheme, resolvedTheme, systemPrefersDark) === 'dark';

    root.classList.toggle('dark', isDark);
  }, [resolvedTheme, theme]);

  return null;
}
