import { useQuery } from '@tanstack/react-query';
import { projectsService } from '@/services/pocketbase/projects.service';
import { queryKeys } from './queryKeys';
import { useAuth } from '@/hooks/useAuth';
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';

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
