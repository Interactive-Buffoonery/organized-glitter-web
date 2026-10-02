import { useState } from 'react';
import { useTheme } from 'next-themes';

import { notify } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import { THEME_OPTIONS, getThemeLabel, isDarkLikeTheme, resolveThemePreference } from '@/lib/theme';
import type { AppTheme } from '@/lib/theme';
import { HugeiconsIcon } from '@hugeicons/react';
import { ColorsIcon, Moon02Icon, Sun03Icon } from '@hugeicons/core-free-icons';

interface ThemePreferencesProps {
  currentThemePreference?: string;
  onThemeUpdate: (themePreference: AppTheme) => Promise<void>;
}

const indicatorIconFor = (theme: AppTheme) => {
  if (theme === 'system') return ColorsIcon;
  return isDarkLikeTheme(theme) ? Moon02Icon : Sun03Icon;
};

export function ThemePreferences({ currentThemePreference, onThemeUpdate }: ThemePreferencesProps) {
  const { setTheme } = useTheme();
  const resolvedThemePreference = resolveThemePreference(currentThemePreference);

  // Tracks the last theme the user clicked while its save is still in flight.
  const [pendingTheme, setPendingTheme] = useState<AppTheme | null>(null);
  const selectedTheme = pendingTheme ?? resolvedThemePreference;

  const handleSelect = async (next: AppTheme) => {
    if (next === selectedTheme) return;

    setPendingTheme(next);
    setTheme(next);

    try {
      await onThemeUpdate(next);
      notify({
        kind: 'success',
        title: 'Theme updated',
        description: `Your theme has been set to ${getThemeLabel(next)}.`,
      });
    } catch {
      // Roll the optimistic preview back to the last-known-good server value.
      setTheme(resolvedThemePreference);
    } finally {
      setPendingTheme(null);
    }
  };

  const isSaving = pendingTheme !== null;
  return (
    <div className="space-y-4">
      <div
        role="radiogroup"
        aria-label="Theme"
        className="bg-muted/40 ring-border/60 flex w-full gap-1 rounded-lg p-1 ring-1"
      >
        {THEME_OPTIONS.map(option => {
          const value = option.value;
          const isSelected = selectedTheme === value;
          const Icon = indicatorIconFor(value);
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={isSaving}
              onClick={() => handleSelect(value)}
              className={cn(
                'relative flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all pointer-coarse:min-h-11',
                'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                'disabled:cursor-not-allowed disabled:opacity-60',
                isSelected
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <HugeiconsIcon icon={Icon} className="size-4" aria-hidden />
              {option.label}
            </button>
          );
        })}
      </div>

      <p className="text-muted-foreground flex items-center gap-2 text-xs" aria-live="polite">
        <HugeiconsIcon icon={indicatorIconFor(selectedTheme)} className="size-3.5" aria-hidden />
        {isSaving ? (
          <>
            Saving <strong className="text-foreground">{getThemeLabel(selectedTheme)}</strong>...
          </>
        ) : (
          <>
            Active theme:{' '}
            <strong className="text-foreground">{getThemeLabel(selectedTheme)}</strong>
          </>
        )}
      </p>
    </div>
  );
}
