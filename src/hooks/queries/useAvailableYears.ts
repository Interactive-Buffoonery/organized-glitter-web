import { useQuery } from '@tanstack/react-query';
import { projectsService } from '@/services/pocketbase/projects.service';
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from './queryKeys';

export const useAvailableYears = () => {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: queryKeys.stats.availableYears(userId || 'anonymous'),
    queryFn: () => projectsService.getAvailableYears(userId!),
    enabled: !!userId,
    ...queryFreshness('frequent'),
  });
};
