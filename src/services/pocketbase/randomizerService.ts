/**
 * @fileoverview Type-safe Randomizer service for PocketBase.
 *
 * CRUD + batch operations for randomizer spin history, with validation and
 * logging. Errors are normalised via the shared ErrorHandler; domain-specific
 * recovery metadata (canRetry / suggestedAction) travels in error.details.
 */

import { pb } from '@/lib/pocketbase';
import { createLogger, truncateUserId } from '@/utils/logger';
import { ErrorHandler } from '@/services/pocketbase/base/ErrorHandler';
import {
  validateCreateSpinParams,
  validateSpinIdOnly,
  validateUserIdOnly,
} from '@/schemas/randomizer.schema';
import type {
  RandomizerSpinsRecord,
  RandomizerSpinsResponse,
  ProjectsResponse,
} from '@/types/pocketbase.types';
import { Collections } from '@/types/pocketbase.types';
import type { RandomizerSpinMetadata } from '@/types/randomizer';

const logger = createLogger('RandomizerService');

interface QueryOptions {
  filter?: string;
  sort: string;
  expand?: string;
}

export interface RandomizerSpinExpand {
  project?: ProjectsResponse;
}

export interface EnhancedCreateSpinParams {
  user: string;
  project?: string;
  project_title: string;
  project_company?: string;
  project_artist?: string;
  selected_projects: string[];
  metadata?: RandomizerSpinMetadata;
}

export async function createSpinEnhanced(
  params: EnhancedCreateSpinParams
): Promise<RandomizerSpinsResponse<RandomizerSpinMetadata | null, string[]>> {
  return ErrorHandler.handleAsync(async () => {
    validateCreateSpinParams(params);

    logger.debug('Creating enhanced spin record', {
      userId: truncateUserId(params.user),
      projectId: params.project,
      selectedCount: params.selected_projects.length,
    });

    const recordData: Partial<RandomizerSpinsRecord> = {
      user: params.user,
      project: params.project,
      project_title: params.project_title,
      project_company: params.project_company,
      project_artist: params.project_artist,
      selected_projects: params.selected_projects,
      selected_count: params.selected_projects.length,
      metadata: params.metadata,
      spun_at: new Date().toISOString(),
    };

    const record = await pb
      .collection(Collections.RandomizerSpins)
      .create<RandomizerSpinsResponse<RandomizerSpinMetadata | null, string[]>>(recordData);

    logger.info('Enhanced spin record created successfully', {
      spinId: record.id,
      userId: truncateUserId(params.user),
      projectTitle: params.project_title,
      selectedCount: params.selected_projects.length,
    });

    return record;
  }, 'Randomizer.createSpinEnhanced');
}

export async function updateSpinMetadata(
  spinId: string,
  metadata: RandomizerSpinMetadata
): Promise<RandomizerSpinsResponse<RandomizerSpinMetadata | null, string[]>> {
  return ErrorHandler.handleAsync(async () => {
    validateSpinIdOnly(spinId);

    return pb
      .collection(Collections.RandomizerSpins)
      .update<RandomizerSpinsResponse<RandomizerSpinMetadata | null, string[]>>(spinId, {
        metadata,
      });
  }, 'Randomizer.updateSpinMetadata');
}

export async function getSpinHistoryEnhanced(
  userId: string,
  limit: number = 8,
  expandProject: boolean = false
): Promise<
  RandomizerSpinsResponse<RandomizerSpinMetadata | null, string[], RandomizerSpinExpand>[]
> {
  return ErrorHandler.handleAsync(async () => {
    validateUserIdOnly(userId);

    if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw ErrorHandler.createError('validation', 'Limit must be between 1 and 500', false, {
        randomizerType: 'VALIDATION_ERROR',
        canRetry: false,
        suggestedAction: 'Please use a reasonable limit for performance',
      });
    }

    logger.debug('Fetching enhanced spin history', {
      userId: truncateUserId(userId),
      limit,
      expandProject,
    });

    const queryOptions: QueryOptions = {
      filter: pb.filter('user = {:userId}', { userId }),
      sort: '-spun_at',
    };

    if (expandProject) {
      queryOptions.expand = 'project';
    }

    const records = await pb
      .collection(Collections.RandomizerSpins)
      .getList<
        RandomizerSpinsResponse<RandomizerSpinMetadata | null, string[], RandomizerSpinExpand>
      >(1, limit, queryOptions);

    logger.debug('Enhanced spin history fetched', {
      userId: truncateUserId(userId),
      recordCount: records.items.length,
      expandProject,
    });

    return records.items;
  }, 'Randomizer.getSpinHistoryEnhanced');
}

export async function getSpinHistoryCountEnhanced(userId: string): Promise<number> {
  return ErrorHandler.handleAsync(async () => {
    validateUserIdOnly(userId);

    logger.debug('Fetching enhanced spin history count', { userId: truncateUserId(userId) });

    const result = await pb.collection(Collections.RandomizerSpins).getList(1, 1, {
      filter: pb.filter('user = {:userId}', { userId }),
      fields: 'id',
    });

    logger.debug('Enhanced spin history count fetched', {
      userId: truncateUserId(userId),
      totalCount: result.totalItems,
    });

    return result.totalItems;
  }, 'Randomizer.getSpinHistoryCountEnhanced');
}
