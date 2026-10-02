import { ClientResponseError } from 'pocketbase';
import { pb } from '@/lib/pocketbase';
import { Collections, type ColoringMediumsResponse } from '@/types/pocketbase.types';
import type {
  ColoringMediumFormValues,
  ColoringMediumRecord,
  ColoringMediumType,
} from '@/types/coloringMedium';
import { ColoringMediumTypeOptions } from '@/types/coloringMedium';
import { getCurrentUserId, isAuthenticated } from '@/services/auth';
import { ErrorHandler } from './base/ErrorHandler';
import { FilterBuilder } from '@/services/pocketbase/base/filterBuilder';

const COLORING_MEDIUMS_COLLECTION = Collections.ColoringMediums;

function requireUserId(): string {
  if (!isAuthenticated()) throw ErrorHandler.createError('auth', 'User not authenticated', false);
  const userId = getCurrentUserId();
  if (!userId) throw ErrorHandler.createError('auth', 'User not authenticated', false);
  return userId;
}

function toRecord(record: ColoringMediumsResponse): ColoringMediumRecord {
  return {
    id: record.id,
    userId: record.user,
    name: record.name,
    type: record.type,
    brand: record.brand ?? '',
    colorCount: record.color_count ?? 0,
    notes: record.notes ?? '',
    createdAt: record.created,
    updatedAt: record.updated,
  };
}

function normalizeInput(input: Partial<ColoringMediumFormValues>) {
  const colorCount =
    input.colorCount === undefined || input.colorCount.trim() === ''
      ? 0
      : Math.max(0, Number.parseInt(input.colorCount, 10) || 0);

  return {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(input.brand !== undefined ? { brand: input.brand.trim() } : {}),
    ...(input.colorCount !== undefined ? { color_count: colorCount } : {}),
    ...(input.notes !== undefined ? { notes: input.notes.trim() } : {}),
  };
}

export class ColoringMediumsService {
  static async listColoringMediums(
    userId?: string
  ): Promise<{ items: ColoringMediumRecord[]; totalItems: number; totalPages: number }> {
    const resolvedUserId = userId ?? requireUserId();
    return ErrorHandler.handleAsync(async () => {
      const records = await pb
        .collection(COLORING_MEDIUMS_COLLECTION)
        .getFullList<ColoringMediumsResponse>({
          filter: pb.filter('user = {:userId}', { userId: resolvedUserId }),
          sort: 'type,name',
        });
      return {
        items: records.map(toRecord),
        totalItems: records.length,
        totalPages: records.length > 0 ? 1 : 0,
      };
    }, 'ColoringMediums.list');
  }

  static async findByName(name: string, userId?: string): Promise<ColoringMediumRecord | null> {
    const resolvedUserId = userId ?? requireUserId();
    try {
      const record = await pb.collection(COLORING_MEDIUMS_COLLECTION).getFirstListItem(
        pb.filter('user = {:userId} && name = {:name}', {
          userId: resolvedUserId,
          name: name.trim(),
        })
      );
      return toRecord(record);
    } catch (error) {
      if (error instanceof ClientResponseError && error.status === 404) return null;
      const handled = ErrorHandler.handleError(error, 'ColoringMediums.findByName');
      if (handled.type === 'not_found') return null;
      throw handled;
    }
  }

  static async createColoringMedium(
    input: ColoringMediumFormValues
  ): Promise<ColoringMediumRecord> {
    const userId = requireUserId();
    return ErrorHandler.handleAsync(async () => {
      const data = normalizeInput(input) as {
        name: string;
        type: ColoringMediumType;
        brand: string;
        color_count: number;
        notes: string;
      };
      if (!Object.values(ColoringMediumTypeOptions).includes(data.type)) {
        throw ErrorHandler.createError('validation', 'Choose a valid medium type', false, {
          field: 'type',
        });
      }

      const existing = await this.findByName(data.name, userId);
      if (existing) {
        throw ErrorHandler.createError(
          'validation',
          `A coloring medium named "${data.name}" already exists`,
          false,
          { field: 'name' }
        );
      }

      const record = await pb.collection(COLORING_MEDIUMS_COLLECTION).create({
        ...data,
        user: userId,
      });
      return toRecord(record);
    }, 'ColoringMediums.create');
  }

  static async updateColoringMedium(
    id: string,
    input: Partial<ColoringMediumFormValues>
  ): Promise<ColoringMediumRecord> {
    const userId = requireUserId();
    return ErrorHandler.handleAsync(async () => {
      const existing = await pb
        .collection(COLORING_MEDIUMS_COLLECTION)
        .getOne(id, { fields: 'id,user' });
      if (existing.user !== userId) {
        throw ErrorHandler.createError(
          'permission',
          "You don't have permission to update this coloring medium",
          false
        );
      }

      const data = normalizeInput(input);
      if (data.name !== undefined) {
        const fb = new FilterBuilder();
        fb.equals('user', userId);
        fb.equals('name', data.name);
        fb.notEquals('id', id);
        const dupes = await pb
          .collection(COLORING_MEDIUMS_COLLECTION)
          .getList(1, 1, { filter: fb.build() });
        if (dupes.items.length > 0) {
          throw ErrorHandler.createError(
            'validation',
            `A coloring medium named "${data.name}" already exists`,
            false,
            { field: 'name' }
          );
        }
      }

      const record = await pb.collection(COLORING_MEDIUMS_COLLECTION).update(id, data);
      return toRecord(record);
    }, 'ColoringMediums.update');
  }

  static async deleteColoringMedium(id: string): Promise<void> {
    const userId = requireUserId();
    return ErrorHandler.handleAsync(async () => {
      const existing = await pb
        .collection(COLORING_MEDIUMS_COLLECTION)
        .getOne(id, { fields: 'id,user' });
      if (existing.user !== userId) {
        throw ErrorHandler.createError(
          'permission',
          "You don't have permission to delete this coloring medium",
          false
        );
      }
      await pb.collection(COLORING_MEDIUMS_COLLECTION).delete(id);
    }, 'ColoringMediums.delete');
  }
}
