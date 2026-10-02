import { pb } from '@/lib/pocketbase';
import { getCurrentUserId, isAuthenticated } from '@/services/auth';
import type { PocketBaseUser } from '@/contexts/AuthContext';
import { Collections } from '@/types/pocketbase.types';
import { createLogger } from '@/utils/logger';
import { ErrorHandler } from './base/ErrorHandler';
import type { PocketBaseError } from './base/types';

const logger = createLogger('AccountDeletionService');

type CollectionName = (typeof Collections)[keyof typeof Collections];

type CascadePlanEntry = {
  collection: CollectionName;
  relation: string;
  parentCollection: CollectionName;
};

type SnapshotCountTarget = {
  collection: CollectionName;
  filter: string;
};

export type AccountDeletionOutcome = {
  status: 'deleted' | 'already_deleted';
};

type AccountDeletionUsageSnapshot = {
  version: 1;
  requestedAt: string;
  cascadeCollections: CascadePlanEntry[];
  counts: Partial<Record<CollectionName, number>>;
  snapshotErrors: Array<{
    collection: CollectionName;
    message: string;
  }>;
};

export const ACCOUNT_DELETION_PLAN = {
  auditCollection: Collections.AccountDeletions,
  manualDeleteCollections: [Collections.Users],
  cascadeCollections: [
    { collection: Collections.Projects, relation: 'user', parentCollection: Collections.Users },
    {
      collection: Collections.ProgressNotes,
      relation: 'project',
      parentCollection: Collections.Projects,
    },
    {
      collection: Collections.ProjectTags,
      relation: 'project',
      parentCollection: Collections.Projects,
    },
    { collection: Collections.Tags, relation: 'user', parentCollection: Collections.Users },
    { collection: Collections.Artists, relation: 'user', parentCollection: Collections.Users },
    { collection: Collections.Companies, relation: 'user', parentCollection: Collections.Users },
    {
      collection: Collections.ColoringBooks,
      relation: 'user',
      parentCollection: Collections.Users,
    },
    {
      collection: Collections.ColoringPages,
      relation: 'book',
      parentCollection: Collections.ColoringBooks,
    },
    {
      collection: Collections.ColoringPageProgressNotes,
      relation: 'user',
      parentCollection: Collections.Users,
    },
    {
      collection: Collections.ColoringPageProgressNotes,
      relation: 'page',
      parentCollection: Collections.ColoringPages,
    },
    {
      collection: Collections.BookPublishers,
      relation: 'user',
      parentCollection: Collections.Users,
    },
    {
      collection: Collections.BookIllustrators,
      relation: 'user',
      parentCollection: Collections.Users,
    },
    {
      collection: Collections.ColoringMediums,
      relation: 'user',
      parentCollection: Collections.Users,
    },
    { collection: Collections.ColoringTags, relation: 'user', parentCollection: Collections.Users },
    {
      collection: Collections.ColoringBookTags,
      relation: 'book',
      parentCollection: Collections.ColoringBooks,
    },
    {
      collection: Collections.ColoringBookTags,
      relation: 'tag',
      parentCollection: Collections.ColoringTags,
    },
    {
      collection: Collections.RandomizerSpins,
      relation: 'user',
      parentCollection: Collections.Users,
    },
    {
      collection: Collections.UserDashboardSettings,
      relation: 'user',
      parentCollection: Collections.Users,
    },
    {
      collection: Collections.UserDashboardStats,
      relation: 'user',
      parentCollection: Collections.Users,
    },
    {
      collection: Collections.UserYearlyStats,
      relation: 'user',
      parentCollection: Collections.Users,
    },
  ] satisfies CascadePlanEntry[],
  snapshotCountTargets: [
    { collection: Collections.Projects, filter: 'user = {:userId}' },
    { collection: Collections.ProgressNotes, filter: 'project.user = {:userId}' },
    { collection: Collections.ProjectTags, filter: 'project.user = {:userId}' },
    { collection: Collections.Tags, filter: 'user = {:userId}' },
    { collection: Collections.Artists, filter: 'user = {:userId}' },
    { collection: Collections.Companies, filter: 'user = {:userId}' },
    { collection: Collections.ColoringBooks, filter: 'user = {:userId}' },
    { collection: Collections.ColoringPages, filter: 'book.user = {:userId}' },
    {
      collection: Collections.ColoringPageProgressNotes,
      filter: 'user = {:userId} && page.book.user = {:userId}',
    },
    { collection: Collections.BookPublishers, filter: 'user = {:userId}' },
    { collection: Collections.BookIllustrators, filter: 'user = {:userId}' },
    { collection: Collections.ColoringMediums, filter: 'user = {:userId}' },
    { collection: Collections.ColoringTags, filter: 'user = {:userId}' },
    { collection: Collections.ColoringBookTags, filter: 'book.user = {:userId}' },
    { collection: Collections.RandomizerSpins, filter: 'user = {:userId}' },
    { collection: Collections.UserDashboardSettings, filter: 'user = {:userId}' },
    { collection: Collections.UserDashboardStats, filter: 'user = {:userId}' },
    { collection: Collections.UserYearlyStats, filter: 'user = {:userId}' },
  ] satisfies SnapshotCountTarget[],
} as const;

type DeleteAccountInput = {
  user: PocketBaseUser;
  notes?: string;
};

type SignupMethodCarrier = {
  id?: string;
  signup_method?: unknown;
  signupMethod?: unknown;
};

function resolveSignupMethod(user: PocketBaseUser): string {
  const authRecord = pb.authStore.record as SignupMethodCarrier | null;
  const candidates: unknown[] = [
    (user as SignupMethodCarrier).signup_method,
    (user as SignupMethodCarrier).signupMethod,
  ];

  if (!authRecord?.id || authRecord.id === user.id) {
    candidates.push(authRecord?.signup_method, authRecord?.signupMethod);
  }

  const method = candidates.find(
    candidate => typeof candidate === 'string' && candidate.trim().length > 0
  );
  return typeof method === 'string' ? method.trim() : 'unknown';
}

function requireCurrentUser(user: PocketBaseUser): void {
  if (!user?.id || !isAuthenticated()) {
    throw ErrorHandler.createError('auth', 'User not authenticated', false);
  }

  const currentUserId = getCurrentUserId();
  if (!currentUserId) {
    throw ErrorHandler.createError('auth', 'User not authenticated', false);
  }

  if (currentUserId !== user.id) {
    throw ErrorHandler.createError(
      'permission',
      "You don't have permission to delete this account",
      false
    );
  }
}

async function getSnapshotCount(target: SnapshotCountTarget, userId: string): Promise<number> {
  const result = await pb.collection(target.collection).getList(1, 1, {
    filter: pb.filter(target.filter, { userId }),
    fields: 'id',
  });
  return result.totalItems ?? result.items.length;
}

async function buildUsageSnapshot(userId: string): Promise<AccountDeletionUsageSnapshot> {
  const counts: Partial<Record<CollectionName, number>> = {};
  const snapshotErrors: AccountDeletionUsageSnapshot['snapshotErrors'] = [];

  await Promise.all(
    ACCOUNT_DELETION_PLAN.snapshotCountTargets.map(async target => {
      try {
        counts[target.collection] = await getSnapshotCount(target, userId);
      } catch (error) {
        const handled = ErrorHandler.handleError(
          error,
          `AccountDeletion.snapshot.${target.collection}`
        );
        snapshotErrors.push({
          collection: target.collection,
          message: handled.message,
        });
      }
    })
  );

  return {
    version: 1,
    requestedAt: new Date().toISOString(),
    cascadeCollections: [...ACCOUNT_DELETION_PLAN.cascadeCollections],
    counts,
    snapshotErrors,
  };
}

function createPostAuditDeleteError(error: PocketBaseError): PocketBaseError {
  return {
    type: error.type,
    message:
      'Your deletion request was captured, but account removal could not finish. Please contact support.',
    status: error.status,
    retryable: error.retryable,
    cause: error,
    details: {
      stage: 'user_delete',
      auditCaptured: true,
    },
  };
}

export class AccountDeletionService {
  static async deleteAccount({
    user,
    notes = '',
  }: DeleteAccountInput): Promise<AccountDeletionOutcome> {
    requireCurrentUser(user);

    const trimmedNotes = notes.trim();
    const usageSnapshot = await buildUsageSnapshot(user.id);

    await ErrorHandler.handleAsync(async () => {
      await pb.collection(ACCOUNT_DELETION_PLAN.auditCollection).create({
        user_id: user.id,
        user_email: user.email?.trim() || 'unknown',
        signup_method: resolveSignupMethod(user),
        ...(trimmedNotes ? { notes: trimmedNotes } : {}),
        usage_snapshot: usageSnapshot,
      });
    }, 'AccountDeletion.createDeletionRequest');

    try {
      await pb.collection(Collections.Users).delete(user.id);
      logger.info(`Deleted account for user ${user.id}`);
      return { status: 'deleted' };
    } catch (error) {
      const handled = ErrorHandler.handleError(error, 'AccountDeletion.deleteUser');
      if (handled.type === 'not_found' || handled.status === 404) {
        logger.warn('User record was already deleted after deletion request was captured', {
          userId: user.id,
        });
        return { status: 'already_deleted' };
      }
      throw createPostAuditDeleteError(handled);
    }
  }
}
