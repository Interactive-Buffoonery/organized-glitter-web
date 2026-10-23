/**
 * Integration tests for useAuth hook with AuthProvider
 * Tests real hook behavior within provider context for comprehensive coverage
 * @author @serabi
 * @created 2025-07-30
 */

import { vi } from 'vitest';
import { ClientResponseError } from 'pocketbase';

const mockNotify = vi.hoisted(() => vi.fn());
vi.mock('@/lib/notifications', () => ({ notify: mockNotify }));
const deletionStore = vi.hoisted(() => ({
  claimSignOut: vi.fn().mockResolvedValue(true),
  releaseSignOut: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/services/accountDeletion/intentStore', () => ({ deletionIntents: deletionStore }));

const pocketBaseMock = vi.hoisted(() => {
  const createListResult = (items: unknown[] = []) => ({
    page: 1,
    perPage: Math.max(items.length, 1),
    totalItems: items.length,
    totalPages: items.length > 0 ? 1 : 0,
    items,
  });

  const authStore = {
    isValid: false,
    token: '',
    record: null as unknown,
    onChange: vi.fn(() => vi.fn()),
    clear: vi.fn(),
    save: vi.fn(),
  };

  const collections = new Map<string, ReturnType<typeof createCollectionMock>>();

  function createCollectionMock() {
    return {
      getOne: vi.fn(),
      getList: vi.fn().mockResolvedValue(createListResult()),
      getFullList: vi.fn().mockResolvedValue([]),
      getFirstListItem: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };
  }

  const pb = {
    authStore,
    collection: vi.fn((name: string) => {
      if (!collections.has(name)) {
        collections.set(name, createCollectionMock());
      }
      return collections.get(name)!;
    }),
    filter: vi.fn((expression: string) => expression),
    files: {
      getURL: vi.fn(
        (_record: Record<string, unknown>, filename: string) => `https://example.com/${filename}`
      ),
      getToken: vi.fn().mockResolvedValue('mock-file-token'),
    },
  };

  const reset = () => {
    authStore.isValid = false;
    authStore.token = '';
    authStore.record = null;
    authStore.onChange = vi.fn(() => vi.fn());
    authStore.clear.mockReset();
    authStore.save.mockReset();
    pb.collection.mockClear();
    pb.filter.mockClear();
    pb.files.getURL.mockClear();
    pb.files.getToken.mockClear();
    collections.clear();
  };

  return {
    pb,
    authStore,
    createListResult,
    getCollection: (name: string) => {
      if (!collections.has(name)) {
        collections.set(name, createCollectionMock());
      }
      return collections.get(name)!;
    },
    reset,
  };
});

// Mock PocketBase module before any imports
vi.mock('@/lib/pocketbase', () => ({
  pb: pocketBaseMock.pb,
}));

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { renderHook } from '@testing-library/react';
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  waitFor,
  createMockUser,
  act,
} from '../../test-utils';
import { useAuth } from '../useAuth';
import { useSessionDraft } from '../useSessionDraft';
import { AuthProvider } from '../../contexts/AuthContext';
import { AuthContextType, PocketBaseUser } from '../../contexts/AuthContext';
import { pb } from '../../lib/pocketbase';
import { queryClient } from '../../lib/queryClient';
import {
  captureSessionDrafts,
  clearSessionDrafts,
  hasSessionDraft,
  isSessionTokenInactive,
  registerSessionDraft,
  recordCompletedSessionCreate,
  reportInvalidSession,
  peekSessionDraft,
} from '@/services/auth/sessionRecovery';
import { POCKETBASE_URL } from '@/lib/pocketbaseConfig';
import { getDraftGeneration, readFormDraft, writeFormDraft } from '@/hooks/drafts/formDraftStorage';
import { UsersService } from '@/services/pocketbase/users.service';

const renderUseAuthHook = () =>
  renderHook((): AuthContextType => useAuth() as AuthContextType, {
    wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
  });

// Helper to create controlled PocketBase auth states
const setupMockAuthState = (
  isValid: boolean,
  user: PocketBaseUser | null = null,
  onChange?: (callback: (token: string | null, record: unknown) => void) => () => void
) => {
  const mockAuthStore = pb.authStore as {
    isValid: boolean;
    token: string;
    record: PocketBaseUser | null;
    onChange: (callback: (token: string | null, record: unknown) => void) => () => void;
  };
  mockAuthStore.isValid = isValid;
  mockAuthStore.token = isValid ? 'mock-token' : '';
  mockAuthStore.record = user;

  if (onChange) {
    mockAuthStore.onChange = onChange;
  } else {
    mockAuthStore.onChange = vi.fn((_callback: (token: string | null, record: unknown) => void) => {
      // Store callback for later use if needed
      return vi.fn(); // Return cleanup function
    });
  }
};

describe('useAuth Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deletionStore.claimSignOut.mockResolvedValue(true);
    deletionStore.releaseSignOut.mockResolvedValue(true);
    pocketBaseMock.reset();
    queryClient.clear();
    clearSessionDrafts();
    // Reset to default unauthenticated state
    setupMockAuthState(false, null);
  });

  afterEach(() => {
    queryClient.clear();
    clearSessionDrafts();
    vi.clearAllMocks();
  });

  describe('Auth State Changes', () => {
    it('does not restore a refresh response after a same-token session replacement', async () => {
      const account = createMockUser({ id: 'refresh-race-account' });
      setupMockAuthState(true, account);
      let finishRefresh: ((value: { token: string; record: PocketBaseUser }) => void) | undefined;
      vi.spyOn(UsersService, 'refreshDetachedSession').mockImplementation(
        () =>
          new Promise(resolve => {
            finishRefresh = resolve;
          }) as ReturnType<typeof UsersService.refreshDetachedSession>
      );

      const { result } = renderUseAuthHook();
      await waitFor(() => expect(finishRefresh).toBeTypeOf('function'));
      const epochKey = 'og:session-identity:v1:pocketbase_auth';
      localStorage.setItem(
        epochKey,
        JSON.stringify({ accountId: account.id, epoch: 'replacement-session' })
      );
      finishRefresh?.({ token: 'refreshed-old-token', record: account });

      await act(async () => Promise.resolve());
      expect(result.current.user?.id).toBe(account.id);
      expect(pocketBaseMock.authStore.save).not.toHaveBeenCalled();
    });

    it('does not clear a replacement session from a stale same-token refresh failure', async () => {
      const account = createMockUser({ id: 'refresh-failure-race-account' });
      setupMockAuthState(true, account);
      let failRefresh: ((error: unknown) => void) | undefined;
      vi.spyOn(UsersService, 'refreshDetachedSession').mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            failRefresh = reject;
          }) as ReturnType<typeof UsersService.refreshDetachedSession>
      );

      renderUseAuthHook();
      await waitFor(() => expect(failRefresh).toBeTypeOf('function'));
      const epochKey = 'og:session-identity:v1:pocketbase_auth';
      localStorage.setItem(
        epochKey,
        JSON.stringify({ accountId: account.id, epoch: 'replacement-session' })
      );
      failRefresh?.(new ClientResponseError({ status: 401 }));

      await act(async () => Promise.resolve());
      expect(pocketBaseMock.authStore.clear).not.toHaveBeenCalled();
    });

    it('does not capture the previous account form when a new session expires before React commits', async () => {
      let onChange: ((token: string | null, record: unknown) => void) | undefined;
      const first = createMockUser({ id: 'draft-first-account' });
      const restoreDraft = vi.fn();
      setupMockAuthState(true, first, callback => {
        onChange = callback;
        return vi.fn();
      });
      const { result } = renderHook(
        () => {
          const auth = useAuth() as AuthContextType;
          useSessionDraft(
            'switching-account-form',
            auth.user?.id,
            () => ({ title: 'First account private draft' }),
            restoreDraft
          );
          return auth;
        },
        {
          wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
        }
      );
      await waitFor(() => expect(result.current.user?.id).toBe(first.id));

      let capturedForNextAccount: unknown;
      act(() => {
        const next = createMockUser({ id: 'draft-second-account' });
        pocketBaseMock.authStore.token = 'draft-second-token';
        pocketBaseMock.authStore.record = next;
        onChange?.('draft-second-token', next);
        reportInvalidSession('draft-second-token');
        capturedForNextAccount = peekSessionDraft('switching-account-form', next.id);
      });

      expect(capturedForNextAccount).toBeUndefined();
      expect(restoreDraft).not.toHaveBeenCalled();
    });
  });

  describe('SignOut Function', () => {
    it('preserves local drafts when clearing the auth store fails', async () => {
      const mockUser = createMockUser({ id: 'draft-signout-user' });
      setupMockAuthState(true, mockUser);
      const identity = {
        backendUrl: POCKETBASE_URL,
        accountId: mockUser.id,
        kind: 'project-new' as const,
      };
      const generation = getDraftGeneration(identity)!;
      writeFormDraft(identity, generation, { title: 'Unfinished' });
      const unregister = registerSessionDraft('/projects/new:diamond', mockUser.id, () => ({
        title: 'Unsent',
      }));
      captureSessionDrafts(mockUser.id, 'mock-token');
      unregister();
      pocketBaseMock.authStore.clear.mockImplementation(() => {
        throw new Error('Auth storage unavailable');
      });

      const { result } = renderUseAuthHook();
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
      expect(isSessionTokenInactive('mock-token')).toBe(false);

      await act(async () => {
        await expect(result.current.signOut()).resolves.toMatchObject({ success: false });
      });
      expect(result.current.isAuthenticated).toBe(true);
      expect(isSessionTokenInactive('mock-token')).toBe(false);
      expect(hasSessionDraft('/projects/new:diamond', mockUser.id)).toBe(true);
      expect(
        readFormDraft(identity, generation, (value): value is { title: string } =>
          Boolean(value && typeof value === 'object' && 'title' in value)
        ).draft?.values.title
      ).toBe('Unfinished');
      pocketBaseMock.authStore.clear.mockReset();
    });

    it('clears account cache and local drafts after successful sign-out', async () => {
      const mockUser = createMockUser({
        id: 'signout-user-123',
        email: 'signout@example.com',
      });

      setupMockAuthState(true, mockUser);
      queryClient.setQueryData(['account-cache', mockUser.id], { title: 'Old account data' });
      const identity = {
        backendUrl: POCKETBASE_URL,
        accountId: mockUser.id,
        kind: 'project-new' as const,
      };
      const generation = getDraftGeneration(identity)!;
      writeFormDraft(identity, generation, { title: 'Unfinished' });

      const { result } = renderUseAuthHook();

      // Wait for initial auth check
      await waitFor(() => {
        expect(result.current.initialCheckComplete).toBe(true);
        expect(result.current.isAuthenticated).toBe(true);
      });

      // Call signOut
      let signOutResult: Awaited<ReturnType<typeof result.current.signOut>> | undefined;
      await act(async () => {
        signOutResult = await result.current.signOut();
      });

      expect(signOutResult?.success).toBe(true);
      expect(signOutResult?.error).toBeNull();
      expect(pb.authStore.clear).toHaveBeenCalled();
      expect(queryClient.getQueryData(['account-cache', mockUser.id])).toBeUndefined();
      expect(
        readFormDraft(identity, generation, (value): value is { title: string } =>
          Boolean(value && typeof value === 'object' && 'title' in value)
        ).draft
      ).toBeNull();
    });

    it('shows a late non-project save only after the same account returns', async () => {
      let onChange: ((token: string | null, record: unknown) => void) | undefined;
      const account = createMockUser({ id: 'late-note-account' });
      setupMockAuthState(true, account, callback => {
        onChange = callback;
        return vi.fn();
      });
      const { result } = renderUseAuthHook();
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      await act(async () => {
        await result.current.signOut();
      });
      const authStore = pb.authStore as { token: string; record: PocketBaseUser | null };
      authStore.token = '';
      authStore.record = null;
      recordCompletedSessionCreate('mock-token', 'progress_notes', 'note-1');
      expect(mockNotify).not.toHaveBeenCalled();
      await new Promise(resolve => setTimeout(resolve, 120));

      act(() => {
        const other = createMockUser({ id: 'another-account' });
        authStore.token = 'another-token';
        authStore.record = other;
        onChange?.('another-token', other);
      });
      expect(mockNotify).not.toHaveBeenCalled();

      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      act(() => {
        authStore.token = 'new-token';
        authStore.record = account;
        onChange?.('new-token', account);
      });
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'info', title: 'Save completed' })
      );
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['progressNotes'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notesFeed'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['projects', 'detail'] });
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: expect.arrayContaining(['stats', 'overview']),
      });
      mockNotify.mockClear();
      recordCompletedSessionCreate('mock-token', 'companies', 'company-2');
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'info', title: 'Save completed' })
      );
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['companies'] });
      invalidate.mockClear();
      mockNotify.mockClear();
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: `og:completed-other-create:v1:${encodeURIComponent(POCKETBASE_URL)}:${account.id}:companies`,
          newValue: '1',
        })
      );
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['companies'] });
      expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'info' }));
      invalidate.mockClear();
      recordCompletedSessionCreate('mock-token', 'coloring_page_progress_notes', 'note-2');
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['coloring-pages'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['coloring-books'] });
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: expect.arrayContaining(['stats', 'overview']),
      });
      invalidate.mockClear();
      recordCompletedSessionCreate('mock-token', 'projects', 'project-3');
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['projects', 'list'] });
      expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['stats'] }));
      invalidate.mockClear();
      recordCompletedSessionCreate('mock-token', 'coloring_books', 'book-3');
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['coloring-books'] });
      expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['stats'] }));
      invalidate.mockRestore();
    });
  });
});
