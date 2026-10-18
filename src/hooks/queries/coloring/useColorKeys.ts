import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';
import { parseSymbolId } from '@/features/coloring/colorKeys/symbols';
import { ColorKeysService } from '@/services/pocketbase/colorKeys.service';

export const colorKeysKey = (userId: string, pageId: string) =>
  queryKeys.coloring.colorKeys.list(userId, pageId);

export function useColorKeys(pageId: string, userId: string) {
  return useQuery({
    queryKey: colorKeysKey(userId, pageId),
    queryFn: () => ColorKeysService.list(pageId, userId),
    enabled: Boolean(pageId && userId),
  });
}

export function useColorKeyHistory(userId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.coloring.colorKeys.history(userId),
    queryFn: () => ColorKeysService.history(userId),
    enabled: Boolean(userId && enabled),
    ...queryFreshness('frequent'),
  });
}

export function useSymbolRequests(userId: string, symbols: string[]) {
  const requestIds = [
    ...new Set(
      symbols.flatMap(symbol => {
        const parsed = parseSymbolId(symbol);
        return parsed?.kind === 'request' ? [parsed.requestId] : [];
      })
    ),
  ].sort();
  return useQuery({
    queryKey: queryKeys.coloring.colorKeys.requests(userId, requestIds),
    queryFn: () => ColorKeysService.requests(userId, requestIds),
    enabled: Boolean(userId && requestIds.length),
    ...queryFreshness('frequent'),
  });
}
