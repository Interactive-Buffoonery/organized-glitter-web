/**
 * Book illustrators service: CRUD for the coloring book illustrators taxonomy
 * @author @serabi
 */

import { ClientResponseError } from 'pocketbase';
import { pb } from '@/lib/pocketbase';
import { Collections, BookIllustratorsResponse } from '@/types/pocketbase.types';
import { ErrorHandler } from './base/ErrorHandler';
import { isAuthenticated, getCurrentUserId } from '@/services/auth';
import { FilterBuilder } from '@/services/pocketbase/base/filterBuilder';
import { listAllPages } from '@/services/pocketbase/base/listAllPages';

function requireUserId(): string {
  if (!isAuthenticated()) throw ErrorHandler.createError('auth', 'User not authenticated', false);
  const userId = getCurrentUserId();
  if (!userId) throw ErrorHandler.createError('auth', 'User not authenticated', false);
  return userId;
}

export interface BookIllustratorDTO {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface BookIllustratorListItem {
  id: string;
  name: string;
}

function toDTO(record: BookIllustratorsResponse): BookIllustratorDTO {
  return {
    id: record.id,
    userId: record.user,
    name: record.name,
    createdAt: record.created,
    updatedAt: record.updated,
  };
}

export class BookIllustratorsService {
  static async list(
    userId: string,
    params: { page?: number; pageSize?: number } = {}
  ): Promise<{ items: BookIllustratorListItem[]; totalItems: number; totalPages: number }> {
    if (!userId) throw ErrorHandler.createError('auth', 'User ID is required', false);
    const { page = 1, pageSize = 500 } = params;
    return ErrorHandler.handleAsync(async () => {
      const result = await pb.collection(Collections.BookIllustrators).getList(page, pageSize, {
        filter: pb.filter('user = {:userId}', { userId }),
        sort: 'name,id',
        fields: 'id,name',
      });
      return { items: result.items, totalItems: result.totalItems, totalPages: result.totalPages };
    }, 'BookIllustrators.list');
  }

  static async listAll(userId: string): ReturnType<typeof BookIllustratorsService.list> {
    return listAllPages((page, pageSize) => this.list(userId, { page, pageSize }), 500, {
      recordLabel: 'illustrators',
    });
  }

  static async getById(id: string): Promise<BookIllustratorDTO> {
    return ErrorHandler.handleAsync(async () => {
      const record = await pb.collection(Collections.BookIllustrators).getOne(id);
      return toDTO(record);
    }, 'BookIllustrators.getById');
  }

  static async findByName(name: string, userId?: string): Promise<BookIllustratorDTO | null> {
    const resolvedUserId = userId ?? requireUserId();
    try {
      const record = await pb
        .collection(Collections.BookIllustrators)
        .getFirstListItem(
          pb.filter('user = {:userId} && name = {:name}', { userId: resolvedUserId, name })
        );
      return toDTO(record);
    } catch (error) {
      if (error instanceof ClientResponseError && error.status === 404) return null;
      const handled = ErrorHandler.handleError(error, 'BookIllustrators.findByName');
      if (handled.type === 'not_found') return null;
      throw handled;
    }
  }

  static async create(data: { name: string }): Promise<BookIllustratorDTO> {
    const userId = requireUserId();
    return ErrorHandler.handleAsync(async () => {
      const name = data.name.trim();
      const existing = await this.findByName(name, userId);
      if (existing) {
        throw ErrorHandler.createError(
          'validation',
          `An illustrator named "${name}" already exists`,
          false,
          {
            field: 'name',
          }
        );
      }
      const record = await pb
        .collection(Collections.BookIllustrators)
        .create({ name, user: userId });
      return toDTO(record);
    }, 'BookIllustrators.create');
  }

  static async createIfNotExists(data: { name: string }): Promise<BookIllustratorDTO> {
    const userId = requireUserId();
    const name = data.name.trim();
    const existing = await this.findByName(name, userId);
    if (existing) return existing;
    return this.create({ name });
  }

  static async update(id: string, data: Partial<{ name: string }>): Promise<BookIllustratorDTO> {
    const userId = requireUserId();
    return ErrorHandler.handleAsync(async () => {
      const existing = await pb
        .collection(Collections.BookIllustrators)
        .getOne(id, { fields: 'id,user' });
      if (existing.user !== userId) {
        throw ErrorHandler.createError(
          'permission',
          "You don't have permission to update this illustrator",
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
          .collection(Collections.BookIllustrators)
          .getList(1, 1, { filter: fb.build() });
        if (dupes.items.length > 0) {
          throw ErrorHandler.createError(
            'validation',
            `An illustrator named "${trimmed}" already exists`,
            false,
            { field: 'name' }
          );
        }
        data = { ...data, name: trimmed };
      }
      const record = await pb.collection(Collections.BookIllustrators).update(id, data);
      return toDTO(record);
    }, 'BookIllustrators.update');
  }

  static async delete(id: string): Promise<void> {
    const userId = requireUserId();
    return ErrorHandler.handleAsync(async () => {
      const existing = await pb
        .collection(Collections.BookIllustrators)
        .getOne(id, { fields: 'id,user' });
      if (existing.user !== userId) {
        throw ErrorHandler.createError(
          'permission',
          "You don't have permission to delete this illustrator",
          false
        );
      }
      await pb.collection(Collections.BookIllustrators).delete(id);
    }, 'BookIllustrators.delete');
  }
}
