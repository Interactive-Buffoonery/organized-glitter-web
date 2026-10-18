import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { colorKeysKey } from '@/hooks/queries/coloring/useColorKeys';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { getCurrentUserId } from '@/services/auth';
import {
  ColorKeysService,
  type ColorKey,
  type ColorKeyInput,
} from '@/services/pocketbase/colorKeys.service';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ColorKeyMutations');

const byStripOrder = (a: ColorKey, b: ColorKey) =>
  a.position - b.position || a.created.localeCompare(b.created);

function settle(
  client: QueryClient,
  userId: string,
  pageId: string,
  update?: (rows: ColorKey[]) => ColorKey[]
) {
  if (getCurrentUserId() !== userId) return;
  const key = colorKeysKey(userId, pageId);
  if (update) client.setQueryData<ColorKey[]>(key, rows => update(rows ?? []).sort(byStripOrder));
  void Promise.all([
    client.invalidateQueries({ queryKey: key }),
    client.invalidateQueries({ queryKey: queryKeys.coloring.colorKeys.history(userId) }),
  ]).catch(() => logger.warn('Color key saved; cache refresh failed.'));
}

export function useCreateColorKey(pageId: string, userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ColorKeyInput) => ColorKeysService.create(pageId, userId, input),
    onSuccess: created =>
      settle(client, userId, pageId, rows => [
        ...rows.filter(row => row.id !== created.id),
        created,
      ]),
    retry: false,
  });
}

export function useUpdateColorKey(pageId: string, userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ColorKeyInput> }) =>
      ColorKeysService.update(id, userId, input),
    onSuccess: saved =>
      settle(client, userId, pageId, rows => rows.map(row => (row.id === saved.id ? saved : row))),
    retry: false,
  });
}

export function useDeleteColorKey(pageId: string, userId: string) {
  const client = useQueryClient();
  const key = colorKeysKey(userId, pageId);
  return useMutation({
    mutationFn: (id: string) => ColorKeysService.remove(id, userId),
    onMutate: async id => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<ColorKey[]>(key);
      client.setQueryData<ColorKey[]>(key, rows => rows?.filter(row => row.id !== id));
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSettled: () => settle(client, userId, pageId),
    retry: false,
  });
}

export function useSetupColorKeys(pageId: string, userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (symbols: string[]) => ColorKeysService.createMany(pageId, userId, symbols),
    onSuccess: created => settle(client, userId, pageId, rows => [...rows, ...created]),
    retry: false,
  });
}
