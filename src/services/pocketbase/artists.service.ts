/**
 * Artists service - CRUD for the diamond painting ARTISTS taxonomy. For coloring book illustrators, see bookIllustrators.service.ts.
 * @author @serabi
 */

import { ClientResponseError } from 'pocketbase';
import { pb } from '@/lib/pocketbase';
import { Collections, ArtistsResponse } from '@/types/pocketbase.types';
import { ArtistDTO } from '@/services/types';
import { ErrorHandler } from './base/ErrorHandler';
import { isAuthenticated, getCurrentUserId } from '@/services/auth';
import { FilterBuilder } from '@/services/pocketbase/base/filterBuilder';

function requireUserId(): string {
  if (!isAuthenticated()) {
    throw ErrorHandler.createError('auth', 'User not authenticated', false);
  }
  const userId = getCurrentUserId();
  if (!userId) {
    throw ErrorHandler.createError('auth', 'User not authenticated', false);
  }
  return userId;
}

/** Narrowed list item - only the fields actually fetched by list() */
export interface ArtistListItem {
  id: string;
  name: string;
}

/** Transform PocketBase record to domain DTO */
function toArtistDTO(record: ArtistsResponse): ArtistDTO {
  return {
    id: record.id,
    userId: record.user,
    name: record.name,
    createdAt: record.created,
    updatedAt: record.updated,
  };
}

export class ArtistsService {
  /** List artists for a user. Accepts explicit userId for query-key determinism. */
  static async list(
    userId: string,
    params: {
      page?: number;
      pageSize?: number;
    } = {}
  ): Promise<{ items: ArtistListItem[]; totalItems: number; totalPages: number }> {
    if (!userId) throw ErrorHandler.createError('auth', 'User ID is required', false);
    const { page = 1, pageSize = 500 } = params;

    return ErrorHandler.handleAsync(async () => {
      const result = await pb.collection(Collections.Artists).getList(page, pageSize, {
        filter: pb.filter('user = {:userId}', { userId }),
        sort: 'name,id',
        fields: 'id,name',
      });

      return {
        items: result.items,
        totalItems: result.totalItems,
        totalPages: result.totalPages,
      };
    }, 'Artists.list');
  }

  /** Get a single artist by ID */
  static async getOne(id: string): Promise<ArtistDTO> {
    return ErrorHandler.handleAsync(async () => {
      const record = await pb.collection(Collections.Artists).getOne(id);
      return toArtistDTO(record);
    }, 'Artists.getOne');
  }

  /** Find an artist by name for a user (returns null if not found) */
  static async findByName(name: string, userId?: string): Promise<ArtistDTO | null> {
    const resolvedUserId = userId ?? requireUserId();

    try {
      const record = await pb
        .collection(Collections.Artists)
        .getFirstListItem(
          pb.filter('user = {:userId} && name = {:name}', { userId: resolvedUserId, name })
        );
      return toArtistDTO(record);
    } catch (error) {
      // 404 is the expected outcome for a find-or-null lookup (used by
      // create()'s uniqueness check). Short-circuit before ErrorHandler so the
      // happy path of "this name is available" doesn't emit an error-level log.
      if (error instanceof ClientResponseError && error.status === 404) {
        return null;
      }
      const handled = ErrorHandler.handleError(error, 'Artists.findByName');
      // Upstream may have already normalized the error (e.g. test mocks, or a
      // layer that rewraps ClientResponseError); still honor not_found here.
      if (handled.type === 'not_found') {
        return null;
      }
      throw handled;
    }
  }

  /** Create an artist for the current user */
  static async create(data: { name: string }): Promise<ArtistDTO> {
    const userId = requireUserId();

    return ErrorHandler.handleAsync(async () => {
      const trimmed = data.name.trim();
      const existing = await this.findByName(trimmed, userId);
      if (existing) {
        throw ErrorHandler.createError(
          'validation',
          `An artist with the name "${trimmed}" already exists`,
          false,
          { field: 'name' }
        );
      }

      const record = await pb.collection(Collections.Artists).create({
        name: trimmed,
        user: userId,
      });
      return toArtistDTO(record);
    }, 'Artists.create');
  }

  /** Update an artist (verifies ownership) */
  static async update(id: string, data: Partial<{ name: string }>): Promise<ArtistDTO> {
    const userId = requireUserId();

    return ErrorHandler.handleAsync(async () => {
      const existing = await pb.collection(Collections.Artists).getOne(id, { fields: 'id,user' });
      if (existing.user !== userId) {
        throw ErrorHandler.createError(
          'permission',
          "You don't have permission to update this artist",
          false
        );
      }

      if (data.name !== undefined) {
        const trimmed = data.name.trim();
        const fb = new FilterBuilder();
        fb.equals('user', userId);
        fb.equals('name', trimmed);
        fb.notEquals('id', id);
        const dupes = await pb
          .collection(Collections.Artists)
          .getList(1, 1, { filter: fb.build() });
        if (dupes.items.length > 0) {
          throw ErrorHandler.createError(
            'validation',
            `An artist with the name "${trimmed}" already exists`,
            false,
            { field: 'name' }
          );
        }
        data = { ...data, name: trimmed };
      }

      const record = await pb.collection(Collections.Artists).update(id, data);
      return toArtistDTO(record);
    }, 'Artists.update');
  }

  /** Delete an artist (verifies ownership) */
  static async delete(id: string): Promise<void> {
    const userId = requireUserId();

    return ErrorHandler.handleAsync(async () => {
      const existing = await pb.collection(Collections.Artists).getOne(id, { fields: 'id,user' });
      if (existing.user !== userId) {
        throw ErrorHandler.createError(
          'permission',
          "You don't have permission to delete this artist",
          false
        );
      }

      await pb.collection(Collections.Artists).delete(id);
    }, 'Artists.delete');
  }
}
