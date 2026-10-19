import { ClientResponseError } from 'pocketbase';
import { pb } from '@/lib/pocketbase';
import { getCurrentUserId } from '@/services/auth';
import {
  parseColorKeyInput,
  parseSymbolRequestInput,
  type ColorKeyInput,
  type SymbolRequestInput,
} from '@/schemas/colorKeySchema';
import {
  Collections,
  type ColoringPageColorKeysResponse,
  type ColoringSymbolRequestsResponse,
} from '@/types/pocketbase.types';
export type ColorKey = ColoringPageColorKeysResponse<string[]>;
export type SymbolRequest = ColoringSymbolRequestsResponse;
export type { ColorKeyInput, SymbolRequestInput };
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
    try {
      await keys().delete(id, { requestKey: null });
    } catch (error) {
      // A color already removed elsewhere is the outcome the user asked for.
      if (!(error instanceof ClientResponseError && error.status === 404)) throw error;
    }
  },

  /** Creates the page's starting rows in one transaction; 409 if the page already has keys. */
  async setup(pageId: string, userId: string, symbols: string[]): Promise<ColorKey[]> {
    requireOwner(userId);
    const { items } = await pb.send<{ items: ColorKey[] }>('/api/coloring/color-keys/setup', {
      method: 'POST',
      body: { page: pageId, symbols },
      requestKey: null,
    });
    return items;
  },

  async history(userId: string): Promise<ColorCodeHistoryEntry[]> {
    requireOwner(userId);
    const { items } = await keys().getList<ColorKey>(1, HISTORY_LIMIT, {
      filter: pb.filter('user = {:user} && code != ""', { user: userId }),
      sort: '-updated',
      fields: 'code,color_name,swatch',
      skipTotal: true,
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

  async createRequest(userId: string, input: SymbolRequestInput): Promise<SymbolRequest> {
    requireOwner(userId);
    const data = parseSymbolRequestInput(input);
    return pb
      .collection(Collections.ColoringSymbolRequests)
      .create<SymbolRequest>({ user: userId, ...data }, { requestKey: null });
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
