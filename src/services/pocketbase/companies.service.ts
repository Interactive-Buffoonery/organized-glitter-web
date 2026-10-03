/**
 * Companies service - CRUD for the diamond painting BRANDS taxonomy. For coloring book publishers, see bookPublishers.service.ts.
 * @author @serabi
 */

import { ClientResponseError } from 'pocketbase';
import { pb } from '@/lib/pocketbase';
import { Collections, CompaniesResponse } from '@/types/pocketbase.types';
import { CompanyDTO } from '@/services/types';
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
export interface CompanyListItem {
  id: string;
  name: string;
  website_url: string;
}

interface CompanyProjectCountsResponse {
  counts: Record<string, number>;
}

/** Transform PocketBase record to domain DTO */
function toCompanyDTO(record: CompaniesResponse): CompanyDTO {
  return {
    id: record.id,
    userId: record.user,
    name: record.name,
    // PB schema has website_url as optional; Required<> on the response type
    // hides this so we default here to honor the DTO contract (always-string).
    websiteUrl: record.website_url ?? '',
    createdAt: record.created,
    updatedAt: record.updated,
  };
}

export class CompaniesService {
  /** List companies for a user (paginated). Accepts explicit userId for query-key determinism. */
  static async list(
    userId: string,
    params: {
      page?: number;
      pageSize?: number;
    } = {}
  ): Promise<{ items: CompanyListItem[]; totalItems: number; totalPages: number }> {
    if (!userId) throw ErrorHandler.createError('auth', 'User ID is required', false);
    const { page = 1, pageSize = 500 } = params;

    return ErrorHandler.handleAsync(async () => {
      const result = await pb.collection(Collections.Companies).getList(page, pageSize, {
        filter: pb.filter('user = {:userId}', { userId }),
        sort: 'name,id',
        fields: 'id,name,website_url',
      });

      return {
        items: result.items,
        totalItems: result.totalItems,
        totalPages: result.totalPages,
      };
    }, 'Companies.list');
  }

  /** Get a single company by ID */
  static async getOne(id: string): Promise<CompanyDTO> {
    return ErrorHandler.handleAsync(async () => {
      const record = await pb.collection(Collections.Companies).getOne(id);
      return toCompanyDTO(record);
    }, 'Companies.getOne');
  }

  /** Find a company by name for a user (returns null if not found) */
  static async findByName(name: string, userId?: string): Promise<CompanyDTO | null> {
    const resolvedUserId = userId ?? requireUserId();

    try {
      const record = await pb
        .collection(Collections.Companies)
        .getFirstListItem(
          pb.filter('user = {:userId} && name = {:name}', { userId: resolvedUserId, name })
        );
      return toCompanyDTO(record);
    } catch (error) {
      // 404 is the expected outcome for a find-or-null lookup (used by
      // create()'s uniqueness check). Short-circuit before ErrorHandler so the
      // happy path of "this name is available" doesn't emit an error-level log.
      if (error instanceof ClientResponseError && error.status === 404) {
        return null;
      }
      const handled = ErrorHandler.handleError(error, 'Companies.findByName');
      // Upstream may have already normalized the error (e.g. test mocks, or a
      // layer that rewraps ClientResponseError); still honor not_found here.
      if (handled.type === 'not_found') {
        return null;
      }
      throw handled;
    }
  }

  /** Create a company for the current user */
  static async create(data: { name: string; website_url?: string }): Promise<CompanyDTO> {
    const userId = requireUserId();

    return ErrorHandler.handleAsync(async () => {
      // Check for duplicates
      const trimmed = data.name.trim();
      const existing = await this.findByName(trimmed, userId);
      if (existing) {
        throw ErrorHandler.createError(
          'validation',
          `A company with the name "${trimmed}" already exists`,
          false,
          { field: 'name' }
        );
      }

      const record = await pb.collection(Collections.Companies).create({
        ...data,
        name: trimmed,
        user: userId,
      });
      return toCompanyDTO(record);
    }, 'Companies.create');
  }

  /** Update a company (verifies ownership) */
  static async update(
    id: string,
    data: Partial<{ name: string; website_url: string }>
  ): Promise<CompanyDTO> {
    const userId = requireUserId();

    return ErrorHandler.handleAsync(async () => {
      const existing = await pb.collection(Collections.Companies).getOne(id, { fields: 'id,user' });
      if (existing.user !== userId) {
        throw ErrorHandler.createError(
          'permission',
          "You don't have permission to update this company",
          false
        );
      }

      // Check for duplicate name (excluding self)
      if (data.name !== undefined) {
        const trimmed = data.name.trim();
        const fb = new FilterBuilder();
        fb.equals('user', userId);
        fb.equals('name', trimmed);
        fb.notEquals('id', id);
        const dupes = await pb
          .collection(Collections.Companies)
          .getList(1, 1, { filter: fb.build() });
        if (dupes.items.length > 0) {
          throw ErrorHandler.createError(
            'validation',
            `A company with the name "${trimmed}" already exists`,
            false,
            { field: 'name' }
          );
        }
        data = { ...data, name: trimmed };
      }

      const record = await pb.collection(Collections.Companies).update(id, data);
      return toCompanyDTO(record);
    }, 'Companies.update');
  }

  /** Delete a company (verifies ownership) */
  static async delete(id: string): Promise<void> {
    const userId = requireUserId();

    return ErrorHandler.handleAsync(async () => {
      const existing = await pb.collection(Collections.Companies).getOne(id, { fields: 'id,user' });
      if (existing.user !== userId) {
        throw ErrorHandler.createError(
          'permission',
          "You don't have permission to delete this company",
          false
        );
      }

      await pb.collection(Collections.Companies).delete(id);
    }, 'Companies.delete');
  }

  /** Get project count for a specific company */
  static async getProjectCount(companyId: string, userId?: string): Promise<number> {
    const resolvedUserId = userId ?? requireUserId();

    return ErrorHandler.handleAsync(async () => {
      const fb = new FilterBuilder();
      fb.equals('user', resolvedUserId);
      fb.equals('company', companyId);
      const result = await pb.collection(Collections.Projects).getList(1, 1, {
        filter: fb.build(),
        fields: 'id',
      });
      return result.totalItems;
    }, 'Companies.getProjectCount');
  }

  /** Get project counts for all companies owned by the current user. */
  static async getProjectCounts(): Promise<Record<string, number>> {
    return ErrorHandler.handleAsync(async () => {
      const result = await pb.send<CompanyProjectCountsResponse>(
        '/api/stats/company-project-counts',
        { method: 'GET' }
      );
      return result.counts;
    }, 'Companies.getProjectCounts');
  }
}
