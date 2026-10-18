import { pb } from '@/lib/pocketbase';
import { getCurrentUserId } from '@/services/auth';
import { parseColorKeyInput, type ColorKeyInput } from '@/schemas/colorKeySchema';
import {
  Collections,
  type ColoringPageColorKeysResponse,
  type ColoringSymbolRequestsResponse,
} from '@/types/pocketbase.types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ColorKeysService');

export type ColorKey = ColoringPageColorKeysResponse<string[]>;
export type { ColorKeyInput };
export type ColorCodeHistoryEntry = { code: string; color_name: string; swatch: string };
export type SymbolRequestPreview = { description: string; thumbnail: string };

// ponytail: bounded history scan; move to a server endpoint if users outgrow 500 recent keys.
const HISTORY_LIMIT = 500;

function requireOwner(userId: string) {
  if (!userId || getCurrentUserId() !== userId)
    throw new Error('Your account changed. Reopen this page.');
}

const keys = () => pb.collection(Collections.ColoringPageColorKeys);

export const ColorKeysService = {
  async list(pageId: string, userId: string): Promise<ColorKey[]> {
    requireOwner(userId);
    const rows = await keys().getFullList<ColorKey>({
      filter: pb.filter('page = {:page} && user = {:user}', { page: pageId, user: userId }),
      sort: 'position,created',
    });
    requireOwner(userId);
    return rows;
  },

  async create(pageId: string, userId: string, input: ColorKeyInput): Promise<ColorKey> {
    requireOwner(userId);
    const data = parseColorKeyInput(input, false);
    return keys().create<ColorKey>({ user: userId, page: pageId, ...data }, { requestKey: null });
  },

  async update(id: string, userId: string, input: Partial<ColorKeyInput>): Promise<ColorKey> {
    requireOwner(userId);
    return keys().update<ColorKey>(id, parseColorKeyInput(input, true), { requestKey: null });
  },

  async remove(id: string, userId: string): Promise<void> {
    requireOwner(userId);
    await keys().delete(id, { requestKey: null });
  },

  /** Creates setup rows at positions 0..n-1. Rolls back what it created if any row fails. */
  async createMany(pageId: string, userId: string, symbols: string[]): Promise<ColorKey[]> {
    requireOwner(userId);
    // ponytail: client-side batch; the PocketBase batch API is not enabled on this backend.
    const results = await Promise.allSettled(
      symbols.map((symbol, position) => this.create(pageId, userId, { symbol, position }))
    );
    const failure = results.find(result => result.status === 'rejected');
    const created = results.flatMap(result =>
      result.status === 'fulfilled' ? [result.value] : []
    );
    if (!failure) return created;
    await Promise.allSettled(created.map(row => this.remove(row.id, userId))).then(cleanup => {
      if (cleanup.some(result => result.status === 'rejected'))
        logger.warn('Some setup rows could not be removed after a failed setup.');
    });
    throw failure.reason;
  },

  async history(userId: string): Promise<ColorCodeHistoryEntry[]> {
    requireOwner(userId);
    const { items } = await keys().getList<ColorKey>(1, HISTORY_LIMIT, {
      filter: pb.filter('user = {:user} && code != ""', { user: userId }),
      sort: '-updated',
      fields: 'code,color_name,swatch',
    });
    const seen = new Map<string, ColorCodeHistoryEntry>();
    for (const item of items) {
      const code = item.code.trim();
      const key = code.toLowerCase();
      if (code && !seen.has(key))
        seen.set(key, { code, color_name: item.color_name ?? '', swatch: item.swatch ?? '' });
    }
    return [...seen.values()];
  },

  async requests(
    userId: string,
    requestIds: string[]
  ): Promise<Record<string, SymbolRequestPreview>> {
    requireOwner(userId);
    if (!requestIds.length) return {};
    const params = Object.fromEntries(requestIds.map((id, index) => [`r${index}`, id]));
    const records = await pb
      .collection(Collections.ColoringSymbolRequests)
      .getFullList<ColoringSymbolRequestsResponse>({
        filter: pb.filter(
          `user = {:user} && (${requestIds.map((_, index) => `id = {:r${index}}`).join(' || ')})`,
          { user: userId, ...params }
        ),
        fields: 'id,collectionId,collectionName,photo,description',
      });
    return Object.fromEntries(
      records.map(record => [
        record.id,
        {
          description: record.description ?? '',
          thumbnail: record.photo ? pb.files.getURL(record, record.photo, { thumb: '96x96f' }) : '',
        },
      ])
    );
  },
};
