import { memo, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import AvatarDisplay from '@/components/profile/AvatarDisplay';
import { createAvatarConfig, getUserInitials } from '@/utils/image/avatarUtils';

interface WelcomeSectionProps {
  displayName: string;
  avatarUrl: string | null;
  avatarType: string | null;
  email: string;
  isLoadingProfile?: boolean;
}

function WelcomeSectionComponent({
  displayName,
  avatarUrl,
  avatarType,
  email,
  isLoadingProfile = false,
}: WelcomeSectionProps) {
  const avatarConfig = useMemo(
    () =>
      createAvatarConfig({
        avatar_url: avatarUrl,
        avatar_type: avatarType,
        email: email,
      }),
    [avatarUrl, avatarType, email]
  );

  const fallbackInitials = useMemo(() => getUserInitials(displayName, email), [displayName, email]);

  // First name for the H1: full displayName if it's a single token, otherwise first token.
  const firstName = useMemo(() => {
    const trimmed = displayName.trim();
    if (!trimmed) return '';
    return trimmed.split(/\s+/)[0];
  }, [displayName]);

  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(
        new Date()
      ),
    []
  );

  return (
    <header className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5">
      <AvatarDisplay
        config={avatarConfig}
        size={48}
        className="flex-shrink-0"
        fallbackInitials={fallbackInitials}
      />
      <div className="flex flex-col gap-1">
        <h1 className="font-handwritten text-foreground text-3xl leading-tight tracking-tight md:text-4xl">
          Welcome back,{' '}
          {isLoadingProfile ? (
            <Skeleton className="inline-block h-9 w-32 align-middle" />
          ) : (
            firstName || 'friend'
          )}
        </h1>
        <p className="text-muted-foreground text-sm">{todayLabel}</p>
      </div>
    </header>
  );
}

export const WelcomeSection = memo(WelcomeSectionComponent);
