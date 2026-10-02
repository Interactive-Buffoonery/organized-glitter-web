import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pbMock = vi.hoisted(() => {
  type CollectionMethods = {
    getList: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  const createListResult = (totalItems = 0) => ({
    page: 1,
    perPage: 1,
    totalItems,
    totalPages: totalItems > 0 ? 1 : 0,
    items: totalItems > 0 ? [{ id: 'record-1' }] : [],
  });

  const collections: Record<string, CollectionMethods> = {};

  const createMethods = (): CollectionMethods => ({
    getList: vi.fn().mockResolvedValue(createListResult()),
    create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    delete: vi.fn().mockResolvedValue(true),
  });

  const methods = (collection: string): CollectionMethods => {
    collections[collection] ??= createMethods();
    return collections[collection];
  };

  return {
    pb: {
      collection: vi.fn((collection: string) => methods(collection)),
      filter: vi.fn((expr: string) => expr),
      authStore: {
        record: null as Record<string, unknown> | null,
      },
    },
    collections,
    createListResult,
    methods,
    reset: () => {
      for (const collection of Object.keys(collections)) {
        delete collections[collection];
      }
      pbMock.pb.collection.mockClear();
      pbMock.pb.filter.mockClear();
      pbMock.pb.authStore.record = null;
    },
  };
});

const authMock = vi.hoisted(() => ({
  isAuthenticated: vi.fn(() => true),
  getCurrentUserId: vi.fn(() => 'user12345678901'),
}));

vi.mock('@/lib/pocketbase', () => ({ pb: pbMock.pb }));
vi.mock('@/services/auth', () => authMock);
vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { ACCOUNT_DELETION_PLAN, AccountDeletionService } from '../accountDeletion.service';
import { Collections } from '@/types/pocketbase.types';
import type { PocketBaseUser } from '@/contexts/AuthContext';

const user: PocketBaseUser = {
  id: 'user12345678901',
  email: 'sarah@example.test',
  username: 'sarah',
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-01-01T00:00:00.000Z',
};

const serviceError = (type: string, message: string, status?: number) => ({
  type,
  message,
  status,
  retryable: false,
});

describe('AccountDeletionService', () => {
  beforeEach(() => {
    pbMock.reset();
    authMock.isAuthenticated.mockReturnValue(true);
    authMock.getCurrentUserId.mockReturnValue(user.id);
  });

  it('creates an audit request before deleting the user record', async () => {
    pbMock.methods(Collections.Projects).getList.mockResolvedValue(pbMock.createListResult(2));

    await expect(
      AccountDeletionService.deleteAccount({ user, notes: '  Leaving feedback  ' })
    ).resolves.toEqual({ status: 'deleted' });

    const auditCreate = pbMock.methods(Collections.AccountDeletions).create;
    const userDelete = pbMock.methods(Collections.Users).delete;

    expect(auditCreate).toHaveBeenCalledWith({
      user_id: user.id,
      user_email: user.email,
      signup_method: 'unknown',
      notes: 'Leaving feedback',
      usage_snapshot: expect.objectContaining({
        version: 1,
        requestedAt: expect.any(String),
        counts: expect.objectContaining({
          [Collections.Projects]: 2,
        }),
        snapshotErrors: [],
      }),
    });
    expect(auditCreate.mock.invocationCallOrder[0]).toBeLessThan(
      userDelete.mock.invocationCallOrder[0]
    );
    expect(userDelete).toHaveBeenCalledWith(user.id);
  });

  it('captures signup_method from the current auth record when available', async () => {
    pbMock.pb.authStore.record = {
      id: user.id,
      signup_method: 'google',
    };

    await AccountDeletionService.deleteAccount({ user });

    expect(pbMock.methods(Collections.AccountDeletions).create).toHaveBeenCalledWith(
      expect.objectContaining({
        signup_method: 'google',
      })
    );
  });

  it('does not manually delete child collections', async () => {
    await AccountDeletionService.deleteAccount({ user });

    const childDeletes = Object.entries(pbMock.collections).filter(
      ([collection, methods]) =>
        collection !== Collections.Users && methods.delete.mock.calls.length
    );

    expect(childDeletes).toEqual([]);
    expect(pbMock.methods(Collections.Users).delete).toHaveBeenCalledWith(user.id);
  });

  it('records snapshot count failures without blocking deletion', async () => {
    pbMock
      .methods(Collections.ColoringPages)
      .getList.mockRejectedValue(serviceError('network', 'Stats unavailable'));

    await expect(AccountDeletionService.deleteAccount({ user })).resolves.toEqual({
      status: 'deleted',
    });

    const auditPayload = pbMock.methods(Collections.AccountDeletions).create.mock.calls[0][0];
    expect(auditPayload.usage_snapshot.snapshotErrors).toEqual(
      expect.arrayContaining([
        {
          collection: Collections.ColoringPages,
          message: 'Stats unavailable',
        },
      ])
    );
    expect(pbMock.methods(Collections.Users).delete).toHaveBeenCalledWith(user.id);
  });

  it('aborts user deletion when the audit request cannot be created', async () => {
    pbMock
      .methods(Collections.AccountDeletions)
      .create.mockRejectedValue(serviceError('validation', 'Audit invalid', 400));

    await expect(AccountDeletionService.deleteAccount({ user })).rejects.toMatchObject({
      type: 'validation',
      message: 'Audit invalid',
    });
    expect(pbMock.methods(Collections.Users).delete).not.toHaveBeenCalled();
  });

  it('returns already_deleted when the current user record is gone after audit capture', async () => {
    pbMock
      .methods(Collections.Users)
      .delete.mockRejectedValue(serviceError('not_found', 'Missing user', 404));

    await expect(AccountDeletionService.deleteAccount({ user })).resolves.toEqual({
      status: 'already_deleted',
    });
  });

  it('throws a stage-aware error when user deletion fails after audit capture', async () => {
    pbMock
      .methods(Collections.Users)
      .delete.mockRejectedValue(serviceError('permission', 'Not allowed', 403));

    await expect(AccountDeletionService.deleteAccount({ user })).rejects.toMatchObject({
      type: 'permission',
      message:
        'Your deletion request was captured, but account removal could not finish. Please contact support.',
      status: 403,
      details: {
        stage: 'user_delete',
        auditCaptured: true,
      },
    });
  });

  it('keeps the documented cascade plan aligned with the PocketBase schema', () => {
    const schema = JSON.parse(
      readFileSync(resolve(process.cwd(), 'docs/pocketbase/collections.schema.json'), 'utf8')
    ) as Array<{
      name: string;
      fields: Array<{ name: string; type: string; cascadeDelete?: boolean }>;
    }>;

    for (const entry of ACCOUNT_DELETION_PLAN.cascadeCollections) {
      const collection = schema.find(item => item.name === entry.collection);
      const relation = collection?.fields.find(
        field => field.type === 'relation' && field.name === entry.relation
      );

      expect(relation, `${entry.collection}.${entry.relation}`).toMatchObject({
        cascadeDelete: true,
      });
    }
  });
});
