/**
 * Book publishers service: CRUD for the coloring book publishers taxonomy
 * @author @serabi
 */

import { ClientResponseError } from 'pocketbase';
import { pb } from '@/lib/pocketbase';
import { Collections, BookPublishersResponse } from '@/types/pocketbase.types';
import { ErrorHandler } from './base/ErrorHandler';
import { isAuthenticated, getCurrentUserId } from '@/services/auth';
import { FilterBuilder } from '@/services/pocketbase/base/filterBuilder';
import { listAllPages } from '@/services/pocketbase/base/listAllPages';

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

export interface BookPublisherDTO {
  id: string;
  userId: string;
  name: string;
  websiteUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface BookPublisherListItem {
  id: string;
  name: string;
  website_url: string;
}

function toDTO(record: BookPublishersResponse): BookPublisherDTO {
  return {
    id: record.id,
    userId: record.user,
    name: record.name,
    websiteUrl: record.website_url ?? '',
    createdAt: record.created,
    updatedAt: record.updated,
  };
}

export class BookPublishersService {
  static async list(
    userId: string,
    params: { page?: number; pageSize?: number } = {}
  ): Promise<{ items: BookPublisherListItem[]; totalItems: number; totalPages: number }> {
    if (!userId) throw ErrorHandler.createError('auth', 'User ID is required', false);
    const { page = 1, pageSize = 500 } = params;

    return ErrorHandler.handleAsync(async () => {
      const result = await pb.collection(Collections.BookPublishers).getList(page, pageSize, {
        filter: pb.filter('user = {:userId}', { userId }),
        sort: 'name,id',
        fields: 'id,name,website_url',
      });
      return { items: result.items, totalItems: result.totalItems, totalPages: result.totalPages };
    }, 'BookPublishers.list');
  }

  static async listAll(userId: string): ReturnType<typeof BookPublishersService.list> {
    return listAllPages((page, pageSize) => this.list(userId, { page, pageSize }), 500, {
      recordLabel: 'publishers',
    });
  }

  static async getById(id: string): Promise<BookPublisherDTO> {
    return ErrorHandler.handleAsync(async () => {
      const record = await pb.collection(Collections.BookPublishers).getOne(id);
      return toDTO(record);
    }, 'BookPublishers.getById');
  }

  static async findByName(name: string, userId?: string): Promise<BookPublisherDTO | null> {
    const resolvedUserId = userId ?? requireUserId();
    try {
      const record = await pb
        .collection(Collections.BookPublishers)
        .getFirstListItem(
          pb.filter('user = {:userId} && name = {:name}', { userId: resolvedUserId, name })
        );
      return toDTO(record);
    } catch (error) {
      if (error instanceof ClientResponseError && error.status === 404) return null;
      const handled = ErrorHandler.handleError(error, 'BookPublishers.findByName');
      if (handled.type === 'not_found') return null;
      throw handled;
    }
  }

  static async create(data: { name: string; website_url?: string }): Promise<BookPublisherDTO> {
    const userId = requireUserId();
    return ErrorHandler.handleAsync(async () => {
      const name = data.name.trim();
      const existing = await this.findByName(name, userId);
      if (existing) {
        throw ErrorHandler.createError(
          'validation',
          `A publisher named "${name}" already exists`,
          false,
          {
            field: 'name',
          }
        );
      }
      const record = await pb.collection(Collections.BookPublishers).create({
        name,
        website_url: data.website_url ?? '',
        user: userId,
      });
      return toDTO(record);
    }, 'BookPublishers.create');
  }

  static async createIfNotExists(data: {
    name: string;
    website_url?: string;
  }): Promise<BookPublisherDTO> {
    const userId = requireUserId();
    const name = data.name.trim();
    const existing = await this.findByName(name, userId);
    if (existing) return existing;
    return this.create({ ...data, name });
  }

  static async update(
    id: string,
    data: Partial<{ name: string; website_url: string }>
  ): Promise<BookPublisherDTO> {
    const userId = requireUserId();
    return ErrorHandler.handleAsync(async () => {
      const existing = await pb
        .collection(Collections.BookPublishers)
        .getOne(id, { fields: 'id,user' });
      if (existing.user !== userId) {
        throw ErrorHandler.createError(
          'permission',
          "You don't have permission to update this publisher",
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
          .collection(Collections.BookPublishers)
          .getList(1, 1, { filter: fb.build() });
        if (dupes.items.length > 0) {
          throw ErrorHandler.createError(
            'validation',
            `A publisher named "${trimmed}" already exists`,
            false,
            { field: 'name' }
          );
        }
        data = { ...data, name: trimmed };
      }
      const record = await pb.collection(Collections.BookPublishers).update(id, data);
      return toDTO(record);
    }, 'BookPublishers.update');
  }

  static async delete(id: string): Promise<void> {
    const userId = requireUserId();
    return ErrorHandler.handleAsync(async () => {
      const existing = await pb
        .collection(Collections.BookPublishers)
        .getOne(id, { fields: 'id,user' });
      if (existing.user !== userId) {
        throw ErrorHandler.createError(
          'permission',
          "You don't have permission to delete this publisher",
          false
        );
      }
      await pb.collection(Collections.BookPublishers).delete(id);
    }, 'BookPublishers.delete');
  }
}
