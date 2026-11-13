import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';
import { CraftingStreakService } from '@/services/pocketbase/craftingStreak.service';
import { craftingStreak } from '@/features/crafting-streak/streak';

export function useCraftingStreak() {
  const { user } = useAuth();
  const timezone = useUserTimezone();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const update = () => setNow(new Date());
    const timer = window.setInterval(update, 60_000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  const query = useQuery({
    queryKey: queryKeys.notesFeed.streak(user?.id || 'anonymous'),
    queryFn: ({ signal }) => CraftingStreakService.dates(user!.id, signal),
    enabled: !!user,
    ...queryFreshness('activity'),
  });
  let count: number | undefined;
  if (query.data && !query.isError) {
    try {
      count = craftingStreak(query.data, now, timezone);
    } catch {
      /* Invalid zone is unavailable. */
    }
  }
  return { count, isPending: query.isPending };
}
