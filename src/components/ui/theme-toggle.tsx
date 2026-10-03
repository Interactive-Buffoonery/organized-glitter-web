import { Check, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { THEME_OPTIONS, resolveThemePreference } from '@/lib/theme';
import type { AppTheme } from '@/lib/theme';
import { useAuth } from '@/hooks/useAuth';
import { useUpdateThemePreferenceMutation } from '@/hooks/mutations/useUpdateThemePreferenceMutation';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const { mutate: updateThemePreference } = useUpdateThemePreferenceMutation();

  const handleSelect = (value: AppTheme) => {
    setTheme(value);
    if (user) {
      updateThemePreference({ userId: user.id, themePreference: value });
    }
  };

  const selectedTheme = resolveThemePreference(theme);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-touch" className="text-foreground">
          <Sun className="size-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute size-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {THEME_OPTIONS.map(opt => (
          <DropdownMenuItem key={opt.value} onClick={() => handleSelect(opt.value)}>
            {opt.label}
            {selectedTheme === opt.value && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
