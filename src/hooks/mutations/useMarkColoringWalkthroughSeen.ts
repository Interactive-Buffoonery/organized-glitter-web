import { useMutation } from '@tanstack/react-query';
import { UsersService } from '@/services/pocketbase/users.service';
import { createLogger } from '@/utils/logger';

const logger = createLogger('useMarkColoringWalkthroughSeen');

const markSeen = async (userId: string): Promise<void> => {
  if (!userId) {
    throw new Error('User ID is required');
  }

  await UsersService.markColoringWalkthroughSeen(userId);
};

export const useMarkColoringWalkthroughSeen = (userId: string | undefined) => {
  return useMutation({
    mutationKey: ['markColoringWalkthroughSeen', userId],
    mutationFn: () => markSeen(userId as string),
    onError: error => {
      logger.error('Failed to mark coloring walkthrough seen', error);
    },
  });
};
