import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { colorKeysKey } from '@/hooks/queries/coloring/useColorKeys';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { getCurrentUserId } from '@/services/auth';
import {
  ColorKeysService,
  type ColorKey,
  type ColorKeyInput,
  type SymbolRequestInput,
} from '@/services/pocketbase/colorKeys.service';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ColorKeyMutations');

const byStripOrder = (a: ColorKey, b: ColorKey) =>
  a.position - b.position || a.created.localeCompare(b.created);

const historyFields = ['code', 'color_name', 'swatch'] as const;

function settle(
  client: QueryClient,
  userId: string,
  pageId: string,
  { update, history }: { update?: (rows: ColorKey[]) => ColorKey[]; history?: boolean } = {}
) {
  if (getCurrentUserId() !== userId) return;
  const key = colorKeysKey(userId, pageId);
  if (update) client.setQueryData<ColorKey[]>(key, rows => update(rows ?? []).sort(byStripOrder));
  void Promise.all([
    client.invalidateQueries({ queryKey: key }),
    history && client.invalidateQueries({ queryKey: queryKeys.coloring.colorKeys.history(userId) }),
  ]).catch(() => logger.warn('Color key saved; cache refresh failed.'));
}

export function useCreateColorKey(pageId: string, userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ColorKeyInput) => ColorKeysService.create(pageId, userId, input),
    onSuccess: created =>
      settle(client, userId, pageId, {
        update: rows => [...rows.filter(row => row.id !== created.id), created],
        history: true,
      }),
    retry: false,
  });
}

export function useUpdateColorKey(pageId: string, userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ColorKeyInput> }) =>
      ColorKeysService.update(id, userId, input),
    onSuccess: saved => {
      const before = client
        .getQueryData<ColorKey[]>(colorKeysKey(userId, pageId))
        ?.find(row => row.id === saved.id);
      settle(client, userId, pageId, {
        update: rows => rows.map(row => (row.id === saved.id ? saved : row)),
        history: !before || historyFields.some(field => before[field] !== saved[field]),
      });
    },
    onError: () => settle(client, userId, pageId),
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
    onSettled: () => settle(client, userId, pageId, { history: true }),
    retry: false,
  });
}

/**
 * Saves `ordered` as positions 0 to n-1, one PATCH per row that moved. If a PATCH fails,
 * rows already moved go back to their old positions so the strip is not left half sorted.
 */
export function useReorderColorKeys(pageId: string, userId: string) {
  const client = useQueryClient();
  const key = colorKeysKey(userId, pageId);
  return useMutation({
    mutationFn: async (ordered: ColorKey[]) => {
      const saved: ColorKey[] = [];
      try {
        for (const [position, row] of ordered.entries())
          if (row.position !== position)
            saved.push(await ColorKeysService.update(row.id, userId, { position }));
      } catch (error) {
        const before = new Map(ordered.map(row => [row.id, row.position]));
        // ponytail: best effort; onError refetches, so a failed revert still shows the server order.
        await Promise.allSettled(
          saved.map(row =>
            ColorKeysService.update(row.id, userId, { position: before.get(row.id)! })
          )
        );
        throw error;
      }
      return saved;
    },
    onMutate: async ordered => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<ColorKey[]>(key);
      client.setQueryData<ColorKey[]>(
        key,
        ordered.map((row, position) => ({ ...row, position }))
      );
      return { previous };
    },
    onSuccess: saved =>
      settle(client, userId, pageId, {
        update: rows => rows.map(row => saved.find(next => next.id === row.id) ?? row),
      }),
    onError: (_error, _ordered, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
      settle(client, userId, pageId);
    },
    retry: false,
  });
}

export function useSetupColorKeys(pageId: string, userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (symbols: string[]) => ColorKeysService.setup(pageId, userId, symbols),
    onSuccess: created => settle(client, userId, pageId, { update: () => created }),
    onError: () => settle(client, userId, pageId),
    retry: false,
  });
}

// ponytail: no invalidation; nothing cached lists requests, and the r: row it may add refreshes its own page.
export function useCreateSymbolRequest(userId: string) {
  return useMutation({
    mutationFn: (input: SymbolRequestInput) => ColorKeysService.createRequest(userId, input),
    retry: false,
  });
}
