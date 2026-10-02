import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';

import { useAuth } from '@/hooks/useAuth';
import { useUserProfileQuery } from '@/hooks/queries/useUserProfileQuery';
import { resolveThemePreference } from '@/lib/theme';

export function AccountThemeSync() {
  const { user, isLoading: authLoading } = useAuth();
  const { setTheme } = useTheme();
  const { data: profileData } = useUserProfileQuery(user?.id);
  const lastAppliedUserThemeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      lastAppliedUserThemeRef.current = null;
      return;
    }

    if (authLoading || !profileData) {
      return;
    }

    const accountTheme = resolveThemePreference(profileData.themePreference);
    const syncKey = `${user.id}:${accountTheme}`;

    if (lastAppliedUserThemeRef.current === syncKey) {
      return;
    }

    lastAppliedUserThemeRef.current = syncKey;
    setTheme(accountTheme);
  }, [authLoading, profileData, setTheme, user?.id]);

  return null;
}
