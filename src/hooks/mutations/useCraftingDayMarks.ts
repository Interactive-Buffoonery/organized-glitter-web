import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { handleMutationError } from '@/hooks/mutations/handleMutationError';
import {
  CraftingStreakService,
  type CraftingHistory,
} from '@/services/pocketbase/craftingStreak.service';
import type { DayMark } from '@/features/crafting-streak/streak';

function useMarksMutation<T>(
  write: (userId: string, input: T) => Promise<unknown>,
  apply: (marks: DayMark[], input: T, result: unknown) => DayMark[],
  context: string
) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = queryKeys.notesFeed.streak(user?.id || 'anonymous');
  return useMutation({
    mutationFn: (input: T) => {
      if (!user) throw new Error('Sign in to mark crafting days');
      return write(user.id, input);
    },
    onSuccess: (result, input) => {
      queryClient.setQueryData<CraftingHistory>(key, old =>
        old ? { ...old, marks: apply(old.marks, input, result) } : old
      );
    },
    onError: error => handleMutationError(error, context),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export const useMarkCraftingDay = () =>
  useMarksMutation<string>(
    (userId, day) => CraftingStreakService.mark(userId, day),
    (marks, _day, created) => [...marks, created as DayMark],
    'marking this day'
  );

export const useUnmarkCraftingDay = () =>
  useMarksMutation<string>(
    (_userId, markId) => CraftingStreakService.unmark(markId),
    (marks, markId) => marks.filter(mark => mark.id !== markId),
    'unmarking this day'
  );
