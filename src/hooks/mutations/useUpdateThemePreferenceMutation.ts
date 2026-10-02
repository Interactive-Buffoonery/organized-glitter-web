import { notify } from '@/lib/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/hooks/queries/queryKeys';
import { UsersService } from '@/services/pocketbase/users.service';
import { UserDTO } from '@/services/types';
import { isAppTheme } from '@/lib/theme';
import type { AppTheme } from '@/lib/theme';
import { createLogger } from '@/utils/logger';

const logger = createLogger('useUpdateThemePreferenceMutation');

interface UpdateThemePreferenceParams {
  userId: string;
  themePreference: AppTheme;
}

export const useUpdateThemePreferenceMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, themePreference }: UpdateThemePreferenceParams) => {
      if (!isAppTheme(themePreference)) {
        throw new Error(`Invalid theme preference: ${themePreference}`);
      }

      logger.debug('Updating user theme preference', { userId, themePreference });

      return await UsersService.update(userId, { theme_preference: themePreference });
    },
    onMutate: async ({ userId, themePreference }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.user.profile(userId) });

      const previousUser = queryClient.getQueryData(queryKeys.user.profile(userId));

      queryClient.setQueryData(queryKeys.user.profile(userId), (old: UserDTO | undefined) => {
        if (!old) return old;
        return {
          ...old,
          themePreference,
        };
      });

      return { previousUser };
    },
    onSuccess: (_, { userId, themePreference }) => {
      logger.info('Successfully updated theme preference', { userId, themePreference });
      queryClient.invalidateQueries({ queryKey: queryKeys.user.profile(userId) });
      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
    onError: (error, { userId, themePreference }, context) => {
      logger.error('Failed to update theme preference', { userId, themePreference, error });

      if (context?.previousUser) {
        queryClient.setQueryData(queryKeys.user.profile(userId), context.previousUser);
      }

      notify({
        kind: 'error',
        title: 'Theme Update Failed',
        description: 'Failed to update your theme. Please try again.',
      });
    },
    onSettled: (_, __, { userId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.profile(userId) });
    },
  });
};
