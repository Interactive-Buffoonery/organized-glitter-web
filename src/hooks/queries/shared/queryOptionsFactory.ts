/**
 * TanStack Query v5 queryOptions factories for improved type inference
 * @author @serabi
 * @created 2025-07-19
 */

import { TagService } from '@/services/pocketbase/tags.service';
import { CompaniesService, CompanyListItem } from '@/services/pocketbase/companies.service';
import { ArtistsService, ArtistListItem } from '@/services/pocketbase/artists.service';
import { queryKeys } from '../queryKeys';
import { createLogger } from '@/utils/logger';
import { createQueryTimer, userScopedQueryOptions } from './queryUtils';
import { listAllPages } from '@/services/pocketbase/base/listAllPages';
import type { Tag } from '@/types/tag';

const logger = createLogger('QueryOptionsFactory');

async function fetchAllCompanies(userId: string): Promise<CompanyListItem[]> {
  if (!userId) {
    throw new Error('User ID is required');
  }

  logger.debug(`Fetching all companies for user ${userId}`);

  const timer = createQueryTimer('QueryOptionsFactory', 'fetchAllCompanies');

  const { items } = await listAllPages(
    (page, pageSize) => CompaniesService.list(userId, { page, pageSize }),
    500,
    { recordLabel: 'companies' }
  );

  timer.stop({ itemCount: items.length });

  return items;
}

async function fetchArtists(userId: string): Promise<ArtistListItem[]> {
  if (!userId) {
    throw new Error('User ID is required');
  }

  logger.debug(`Fetching artists for user ${userId}`);

  const timer = createQueryTimer('QueryOptionsFactory', 'fetchArtists');

  const { items } = await listAllPages(
    (page, pageSize) => ArtistsService.list(userId, { page, pageSize }),
    500,
    { recordLabel: 'artists' }
  );

  timer.stop({ itemCount: items.length });

  return items;
}

async function fetchTags(userId: string): Promise<Tag[]> {
  logger.debug('Fetching tags using TagService');

  const timer = createQueryTimer('QueryOptionsFactory', 'fetchTags');

  try {
    const result = await TagService.getUserTags({}, userId);

    if (result.status === 'error') {
      logger.error('Tags fetch failed', result.error);
      const errorMessage = result.error instanceof Error ? result.error.message : result.error;
      throw new Error(errorMessage || 'Failed to fetch tags');
    }

    timer.stop({ itemCount: result.data.length });

    return result.data;
  } catch (error) {
    logger.error('Tags fetch error', error);
    throw error;
  }
}

export function allCompaniesOptions(userId: string) {
  return userScopedQueryOptions({
    queryKey: queryKeys.companies.allForUser(userId),
    queryFn: () => fetchAllCompanies(userId),
    userId,
    freshness: 'standard',
  });
}

export function artistsOptions(userId: string) {
  return userScopedQueryOptions({
    queryKey: queryKeys.artists.list(userId),
    queryFn: () => fetchArtists(userId),
    userId,
    freshness: 'frequent',
  });
}

export function tagsOptions(userId: string) {
  return userScopedQueryOptions({
    queryKey: queryKeys.tags.list(userId),
    queryFn: () => fetchTags(userId),
    userId,
    freshness: 'frequent',
  });
}
