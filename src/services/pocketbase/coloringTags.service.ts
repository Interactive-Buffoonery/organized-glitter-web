import { pb } from '@/lib/pocketbase';
import { getCurrentUserId, isAuthenticated } from '@/services/auth';
import { Collections, type ColoringBookTagsResponse } from '@/types/pocketbase.types';
import type { Tag, TagFormValues } from '@/types/tag';
import { createErrorResponse, createSuccessResponse, type ServiceResponse } from '@/types/shared';
import { TAG_COLOR_PALETTE } from '@/utils/ui/tagColors';
import { generateSlug } from '@/utils/ui/slugify';
import { createLogger } from '@/utils/logger';
import { isSessionChangedError } from '@/services/auth/sessionRecovery';

const logger = createLogger('ColoringTagService');
const COLORING_TAGS_COLLECTION = 'coloring_tags';
const TAG_COLORS = TAG_COLOR_PALETTE.map(color => color.hex);

type ColoringTagsResponse = {
  id: string;
  user: string;
  name: string;
  slug: string;
  color: string;
  created: string;
  updated: string;
};

type ExpandedBookTag = ColoringBookTagsResponse<{
  tag: Partial<ColoringTagsResponse>;
}>;

function withAuthentication<T>(
  operation: (userId: string) => Promise<ServiceResponse<T>>
): Promise<ServiceResponse<T>> {
  if (!isAuthenticated()) {
    return Promise.resolve(createErrorResponse(new Error('User not authenticated')));
  }
  const userId = getCurrentUserId();
  if (!userId) {
    return Promise.resolve(createErrorResponse(new Error('User not authenticated')));
  }
  return operation(userId);
}

const toTag = (record: Partial<ColoringTagsResponse>): Tag | null => {
  if (!record.id || !record.name) return null;
  return {
    id: record.id,
    userId: record.user ?? '',
    name: record.name,
    slug: record.slug ?? '',
    color: record.color ?? '#14b8a6',
    createdAt: record.created ?? '',
    updatedAt: record.updated ?? '',
  };
};

export class ColoringTagService {
  static async listColoringTags(
    options: { search?: string } = {}
  ): Promise<ServiceResponse<Tag[]>> {
    return withAuthentication(async userId => {
      try {
        const clauses = [pb.filter('user = {:userId}', { userId })];
        if (options.search?.trim()) {
          clauses.push(pb.filter('name ~ {:search}', { search: options.search.trim() }));
        }

        const records = await pb
          .collection(COLORING_TAGS_COLLECTION)
          .getList<ColoringTagsResponse>(1, 200, {
            filter: clauses.join(' && '),
            sort: 'name',
          });

        return createSuccessResponse(
          records.items.map(record => toTag(record)).filter((tag): tag is Tag => Boolean(tag))
        );
      } catch (error) {
        logger.error('Error loading coloring tags:', { error });
        return createErrorResponse(error as Error);
      }
    });
  }

  static async createColoringTag(tagData: TagFormValues): Promise<ServiceResponse<Tag>> {
    return withAuthentication(async userId => {
      try {
        const trimmedName = tagData.name.trim();
        const existing = await pb.collection(COLORING_TAGS_COLLECTION).getList(1, 1, {
          filter: pb.filter('user = {:userId} && name = {:name}', {
            userId,
            name: trimmedName,
          }),
        });

        if (existing.items.length > 0) {
          return createErrorResponse(
            new Error(`A coloring tag named "${trimmedName}" already exists`)
          );
        }

        const tag = await pb.collection(COLORING_TAGS_COLLECTION).create<ColoringTagsResponse>({
          user: userId,
          name: trimmedName,
          slug: generateSlug(trimmedName),
          color: tagData.color || TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)],
        });
        const normalizedTag = toTag(tag);
        if (!normalizedTag) {
          return createErrorResponse(
            new Error('Failed to retrieve coloring tag data after creation')
          );
        }
        return createSuccessResponse(normalizedTag);
      } catch (error) {
        logger.error('Error creating coloring tag:', { error });
        return createErrorResponse(error as Error);
      }
    });
  }

  static async updateColoringTag(
    tagId: string,
    updates: Partial<TagFormValues>
  ): Promise<ServiceResponse<Tag>> {
    return withAuthentication(async userId => {
      try {
        const existingTag = await pb.collection(COLORING_TAGS_COLLECTION).getOne(tagId, {
          fields: 'id,user',
        });
        if (existingTag.user !== userId) {
          return createErrorResponse(new Error('Unauthorized access to coloring tag'));
        }

        const updateData: Partial<{ name: string; slug: string; color: string }> = {};
        if (updates.name !== undefined) {
          const trimmedName = updates.name.trim();
          const existing = await pb.collection(COLORING_TAGS_COLLECTION).getList(1, 1, {
            filter: pb.filter('user = {:userId} && name = {:name} && id != {:tagId}', {
              userId,
              name: trimmedName,
              tagId,
            }),
          });
          if (existing.items.length > 0) {
            return createErrorResponse(
              new Error(`A coloring tag named "${trimmedName}" already exists`)
            );
          }
          updateData.name = trimmedName;
          updateData.slug = generateSlug(trimmedName);
        }
        if (updates.color !== undefined) {
          updateData.color = updates.color;
        }

        const updated = await pb
          .collection(COLORING_TAGS_COLLECTION)
          .update<ColoringTagsResponse>(tagId, updateData);
        const normalizedTag = toTag(updated);
        if (!normalizedTag) {
          return createErrorResponse(
            new Error('Failed to retrieve coloring tag data after update')
          );
        }
        return createSuccessResponse(normalizedTag);
      } catch (error) {
        logger.error('Error updating coloring tag:', { error });
        return createErrorResponse(error as Error);
      }
    });
  }

  static async deleteColoringTag(tagId: string): Promise<ServiceResponse<void>> {
    return withAuthentication(async userId => {
      try {
        const existingTag = await pb.collection(COLORING_TAGS_COLLECTION).getOne(tagId, {
          fields: 'id,user',
        });
        if (existingTag.user !== userId) {
          return createErrorResponse(new Error('Unauthorized access to coloring tag'));
        }

        await pb.collection(COLORING_TAGS_COLLECTION).delete(tagId);

        return createSuccessResponse(undefined);
      } catch (error) {
        logger.error('Error deleting coloring tag:', { error });
        return createErrorResponse(error as Error);
      }
    });
  }
  static async getBookTags(bookId: string): Promise<ServiceResponse<Tag[]>> {
    return withAuthentication(async userId => {
      try {
        const book = await pb.collection(Collections.ColoringBooks).getOne(bookId, {
          fields: 'id,user',
        });
        if (book.user !== userId) {
          return createErrorResponse(new Error('Unauthorized access'));
        }

        const result = await pb
          .collection(Collections.ColoringBookTags)
          .getList<ExpandedBookTag>(1, 200, {
            filter: pb.filter('book = {:bookId}', { bookId }),
            expand: 'tag',
          });

        return createSuccessResponse(
          result.items
            .map(record => toTag(record.expand?.tag ?? {}))
            .filter((tag): tag is Tag => Boolean(tag))
        );
      } catch (error) {
        logger.error('Error loading coloring book tags:', { error });
        return createErrorResponse(error as Error);
      }
    });
  }

  static async syncBookTags(bookId: string, tagIds: string[]): Promise<ServiceResponse<void>> {
    return withAuthentication(async userId => {
      try {
        const book = await pb.collection(Collections.ColoringBooks).getOne(bookId, {
          fields: 'id,user',
        });
        if (book.user !== userId) {
          return createErrorResponse(new Error('Unauthorized access'));
        }

        const uniqueTagIds = Array.from(new Set(tagIds.filter(Boolean)));
        const tags = await Promise.all(
          uniqueTagIds.map(tagId =>
            pb.collection(COLORING_TAGS_COLLECTION).getOne(tagId, { fields: 'id,user' })
          )
        );

        if (tags.some(tag => tag.user !== userId)) {
          return createErrorResponse(new Error('Unauthorized access'));
        }

        const existing = await pb
          .collection(Collections.ColoringBookTags)
          .getFullList<ColoringBookTagsResponse>({
            filter: pb.filter('book = {:bookId}', { bookId }),
          });
        const existingByTag = new Map(existing.map(record => [record.tag, record.id]));
        const next = new Set(uniqueTagIds);

        await Promise.all(
          uniqueTagIds
            .filter(tagId => !existingByTag.has(tagId))
            .map(tagId =>
              pb.collection(Collections.ColoringBookTags).create({ book: bookId, tag: tagId })
            )
        );
        await Promise.all(
          existing
            .filter(record => !next.has(record.tag))
            .map(record => pb.collection(Collections.ColoringBookTags).delete(record.id))
        );

        return createSuccessResponse(undefined);
      } catch (error) {
        if (isSessionChangedError(error)) throw error;
        logger.error('Error syncing coloring book tags:', { error });
        return createErrorResponse(error as Error);
      }
    });
  }

  static async getBulkColoringTagStats(
    tagIds: string[]
  ): Promise<ServiceResponse<Record<string, number>>> {
    return withAuthentication(async () => {
      try {
        const counts = Object.fromEntries(tagIds.map(tagId => [tagId, 0]));
        if (tagIds.length === 0) return createSuccessResponse(counts);

        const result = await pb.send<{ counts: Record<string, number> }>(
          '/api/stats/coloring-tag-book-counts',
          { method: 'GET' }
        );
        for (const tagId of tagIds) {
          counts[tagId] = result.counts[tagId] ?? 0;
        }

        return createSuccessResponse(counts);
      } catch (error) {
        logger.error('Error loading coloring tag stats:', { error });
        return createErrorResponse(error as Error);
      }
    });
  }
}
