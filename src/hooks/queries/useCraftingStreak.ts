import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';
import { CraftingStreakService } from '@/services/pocketbase/craftingStreak.service';
import {
  craftingStreak,
  craftingWeek,
  slotDay,
  type WeekDay,
} from '@/features/crafting-streak/streak';

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
    queryFn: ({ signal }) => CraftingStreakService.history(user!.id, new Date(), signal),
    enabled: !!user,
    ...queryFreshness('activity'),
    // Any write elsewhere in the app can add today's activity, so Home rechecks on every visit.
    refetchOnMount: 'always',
  });
  let count: number | undefined;
  let week: WeekDay[] = [];
  if (query.data && !query.isError) {
    try {
      const { noteDates, slots, marks } = query.data;
      const activityDays = [
        ...noteDates,
        ...slots.map(slot => slotDay(slot, timezone)).filter((day): day is string => !!day),
      ];
      count = craftingStreak([...activityDays, ...marks.map(mark => mark.day)], now, timezone);
      week = craftingWeek({ activityDays, marks }, now, timezone);
    } catch {
      /* Invalid zone is unavailable. */
    }
  }
  return { count, week, isPending: query.isPending };
}
