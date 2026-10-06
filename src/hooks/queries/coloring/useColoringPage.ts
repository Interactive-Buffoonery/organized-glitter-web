import { useQuery } from '@tanstack/react-query';
import { ColoringService, type ColoringPageDTO } from '@/services/pocketbase/coloring.service';
import { queryKeys } from '@/hooks/queries/queryKeys';

export function useColoringPage(pageId: string | undefined) {
  return useQuery<ColoringPageDTO | null>({
    queryKey: queryKeys.coloring.pages.detail(pageId || ''),
    queryFn: () => ColoringService.getPageById(pageId!),
    enabled: !!pageId,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}
