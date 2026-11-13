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

async function fetchTaxonomy<T>(
  userId: string,
  operation: string,
  recordLabel: string,
  loadPage: (
    page: number,
    pageSize: number
  ) => Promise<{
    items: T[];
    totalItems: number;
    totalPages: number;
  }>
): Promise<T[]> {
  if (!userId) {
    throw new Error('User ID is required');
  }

  logger.debug(`Fetching ${recordLabel} for user ${userId}`);
  const timer = createQueryTimer('QueryOptionsFactory', operation);
  const { items } = await listAllPages(loadPage, 500, { recordLabel });
  timer.stop({ itemCount: items.length });
  return items;
}

function fetchAllCompanies(userId: string): Promise<CompanyListItem[]> {
  return fetchTaxonomy(userId, 'fetchAllCompanies', 'companies', (page, pageSize) =>
    CompaniesService.list(userId, { page, pageSize })
  );
}

function fetchArtists(userId: string): Promise<ArtistListItem[]> {
  return fetchTaxonomy(userId, 'fetchArtists', 'artists', (page, pageSize) =>
    ArtistsService.list(userId, { page, pageSize })
  );
}

async function fetchTags(userId: string): Promise<Tag[]> {
  logger.debug('Fetching tags using TagService');

  const timer = createQueryTimer('QueryOptionsFactory', 'fetchTags');

  try {
    const result = await TagService.getUserTags({}, userId);

    if (result.status === 'error') {
      logger.error('Tags fetch failed', result.error);
      throw result.error;
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
    freshness: 'standard',
  });
}

export function tagsOptions(userId: string) {
  return userScopedQueryOptions({
    queryKey: queryKeys.tags.list(userId),
    queryFn: () => fetchTags(userId),
    userId,
    freshness: 'standard',
  });
}
