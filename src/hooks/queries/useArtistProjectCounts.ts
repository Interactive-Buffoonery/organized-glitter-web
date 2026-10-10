import { useQuery } from '@tanstack/react-query';
import { ArtistsService } from '@/services/pocketbase/artists.service';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from './queryKeys';
import { userScopedQueryOptions } from './shared/queryUtils';

/** Project counts keyed by artist ID. Artists with no projects are omitted. */
export const useArtistProjectCounts = () => {
  const { user } = useAuth();
  const userId = user?.id || '';
  return useQuery(
    userScopedQueryOptions({
      queryKey: queryKeys.stats.artistProjectCounts(userId),
      queryFn: () => ArtistsService.getProjectCounts(),
      userId,
      freshness: 'frequent',
    })
  );
};
