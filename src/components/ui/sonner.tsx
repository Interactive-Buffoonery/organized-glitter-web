import type { ComponentProps } from 'react';
import { CircleCheck, Info, LoaderCircle, OctagonX, TriangleAlert, X } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';

import { getThemeColorScheme, resolveThemePreference } from '@/lib/theme';

type ToasterProps = ComponentProps<typeof Sonner>;

const toastClassNames = {
  toast:
    'group toast !border-border !bg-card !text-card-foreground !shadow-lg !shadow-black/10 dark:!shadow-black/40',
  title: '!text-card-foreground text-base font-semibold',
  description: '!text-muted-foreground text-sm leading-snug',
  closeButton:
    '!size-8 !min-h-8 !min-w-8 !border-0 !bg-transparent !text-foreground/70 !opacity-100 !shadow-none transition-colors hover:!bg-transparent hover:!text-foreground focus-visible:!ring-2 focus-visible:!ring-ring focus-visible:!ring-offset-2 focus-visible:!ring-offset-background',
  actionButton: '!bg-primary !text-primary-foreground',
  cancelButton: '!bg-muted !text-muted-foreground',
  success:
    '!border-emerald-200 !bg-emerald-50 !text-emerald-950 dark:!border-emerald-800 dark:!bg-emerald-950 dark:!text-emerald-50 [&_[data-title]]:!text-emerald-950 dark:[&_[data-title]]:!text-emerald-50 [&_[data-description]]:!text-emerald-900 dark:[&_[data-description]]:!text-emerald-200',
  warning:
    '!border-amber-200 !bg-amber-50 !text-amber-950 dark:!border-amber-800 dark:!bg-amber-950 dark:!text-amber-50 [&_[data-title]]:!text-amber-950 dark:[&_[data-title]]:!text-amber-50 [&_[data-description]]:!text-amber-900 dark:[&_[data-description]]:!text-amber-200',
  error:
    '!border-destructive/50 !bg-destructive !text-destructive-foreground dark:!border-destructive dark:!bg-destructive dark:!text-destructive-foreground [&_[data-title]]:!text-destructive-foreground [&_[data-description]]:!text-destructive-foreground/95',
  info: '!border-border !bg-card !text-card-foreground [&_[data-description]]:!text-muted-foreground',
};

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme, theme } = useTheme();
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const sonnerTheme = getThemeColorScheme(
    resolveThemePreference(theme),
    resolvedTheme,
    systemPrefersDark
  );

  return (
    <Sonner
      theme={sonnerTheme}
      className="toaster group"
      position="top-right"
      richColors={false}
      closeButton
      icons={{
        success: <CircleCheck className="size-4" />,
        info: <Info className="size-4" />,
        warning: <TriangleAlert className="size-4" />,
        error: <OctagonX className="size-4" />,
        loading: <LoaderCircle className="size-4 animate-spin" />,
        close: <X className="size-4" aria-hidden="true" />,
      }}
      toastOptions={{
        classNames: toastClassNames,
      }}
      {...props}
    />
  );
};

export { Toaster };
