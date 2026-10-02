/**
 * Integration tests for useAuth hook with AuthProvider
 * Tests real hook behavior within provider context for comprehensive coverage
 * @author @serabi
 * @created 2025-07-30
 */

import { vi } from 'vitest';

const mockNotify = vi.hoisted(() => vi.fn());
vi.mock('@/lib/notifications', () => ({ notify: mockNotify }));

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
  renderWithProviders,
  screen,
  waitFor,
  createMockUser,
  act,
  userEvent,
} from '../../test-utils';
import { useAuth } from '../useAuth';
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
  takeSessionDraft,
  recordCompletedSessionCreate,
  takeCompletedSessionDestination,
  completeSessionRecovery,
} from '@/services/auth/sessionRecovery';
import { POCKETBASE_URL } from '@/lib/pocketbaseConfig';
import { getDraftGeneration, readFormDraft, writeFormDraft } from '@/hooks/drafts/formDraftStorage';

const renderUseAuthHook = () =>
  renderHook((): AuthContextType => useAuth() as AuthContextType, {
    wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
  });

// Test component that consumes useAuth hook
const AuthStateTestComponent: React.FC = () => {
  const { user, isAuthenticated, isLoading, initialCheckComplete, signOut } =
    useAuth() as AuthContextType;

  return (
    <div>
      <div data-testid="loading-state">{isLoading ? 'loading' : 'idle'}</div>
      <div data-testid="auth-state">{isAuthenticated ? 'authenticated' : 'unauthenticated'}</div>
      <div data-testid="initial-check">{initialCheckComplete ? 'complete' : 'pending'}</div>
      {user && (
        <div>
          <div data-testid="user-id">{user.id}</div>
          <div data-testid="user-email">{user.email}</div>
        </div>
      )}
      <button data-testid="signout-btn" onClick={() => signOut()} disabled={isLoading}>
        Sign Out
      </button>
    </div>
  );
};

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

  describe('Error Boundaries', () => {
    it('should throw error when used outside AuthProvider', () => {
      // Mock console.error to avoid noise in tests
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useAuth());
      }).toThrow('useAuth must be used within an AuthProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('Hook Context Integration', () => {
    it('captures active drafts when the initial stored token has expired', async () => {
      setupMockAuthState(false, createMockUser({ id: 'account-a' }));
      pocketBaseMock.authStore.token = 'expired-token';
      const unregister = registerSessionDraft('project-edit', () => ({ title: 'Unsaved' }));

      const { result } = renderUseAuthHook();

      await waitFor(() => expect(result.current.initialCheckComplete).toBe(true));
      expect(hasSessionDraft('project-edit', 'account-a')).toBe(true);
      unregister();
    });

    it('should return auth context values when used within AuthProvider', () => {
      setupMockAuthState(false, null);

      const { result } = renderUseAuthHook();

      expect(result.current).toHaveProperty('user');
      expect(result.current).toHaveProperty('isAuthenticated');
      expect(result.current).toHaveProperty('isLoading');
      expect(result.current).toHaveProperty('initialCheckComplete');
      expect(result.current).toHaveProperty('signOut');
      expect(typeof result.current.signOut).toBe('function');
    });

    it('should return unauthenticated state when no user is present', async () => {
      setupMockAuthState(false, null);

      const { result } = renderUseAuthHook();

      // Wait for initial auth check to complete
      await waitFor(() => {
        expect(result.current.initialCheckComplete).toBe(true);
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    it('should return authenticated state when valid user is present', async () => {
      const mockUser = createMockUser({
        id: 'auth-user-123',
        email: 'authenticated@example.com',
      });

      setupMockAuthState(true, mockUser);

      const { result } = renderUseAuthHook();

      // Wait for initial auth check to complete
      await waitFor(() => {
        expect(result.current.initialCheckComplete).toBe(true);
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('Component Integration', () => {
    it('should provide auth state to consuming components (unauthenticated)', async () => {
      setupMockAuthState(false, null);

      renderWithProviders(
        <AuthProvider>
          <AuthStateTestComponent />
        </AuthProvider>
      );

      // Wait for auth check to complete
      await waitFor(() => {
        expect(screen.getByTestId('initial-check')).toHaveTextContent('complete');
      });

      expect(screen.getByTestId('auth-state')).toHaveTextContent('unauthenticated');
      expect(screen.getByTestId('loading-state')).toHaveTextContent('idle');
      expect(screen.queryByTestId('user-id')).not.toBeInTheDocument();
      expect(screen.queryByTestId('user-email')).not.toBeInTheDocument();
    });

    it('should provide auth state to consuming components (authenticated)', async () => {
      const mockUser = createMockUser({
        id: 'component-user-456',
        email: 'component@example.com',
      });

      setupMockAuthState(true, mockUser);

      renderWithProviders(
        <AuthProvider>
          <AuthStateTestComponent />
        </AuthProvider>
      );

      // Wait for auth check to complete
      await waitFor(() => {
        expect(screen.getByTestId('initial-check')).toHaveTextContent('complete');
      });

      expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated');
      expect(screen.getByTestId('loading-state')).toHaveTextContent('idle');
      expect(screen.getByTestId('user-id')).toHaveTextContent('component-user-456');
      expect(screen.getByTestId('user-email')).toHaveTextContent('component@example.com');
    });

    it('should show loading state during initial auth check', async () => {
      setupMockAuthState(false, null);

      renderWithProviders(
        <AuthProvider>
          <AuthStateTestComponent />
        </AuthProvider>
      );

      // Check initial loading state - might need to wait for component mount
      await waitFor(() => {
        expect(screen.getByTestId('loading-state')).toBeInTheDocument();
      });

      // Should eventually complete the check
      await waitFor(() => {
        expect(screen.getByTestId('initial-check')).toHaveTextContent('complete');
      });
    });
  });

  describe('Auth State Changes', () => {
    it('guards every refreshed token when the session ends', async () => {
      let onChange: ((token: string | null, record: unknown) => void) | undefined;
      const account = createMockUser({ id: 'refreshed-account' });
      setupMockAuthState(true, account, callback => {
        onChange = callback;
        return vi.fn();
      });
      const { result } = renderUseAuthHook();
      await waitFor(() => expect(result.current.initialCheckComplete).toBe(true));

      const authStore = pb.authStore as { token: string; record: PocketBaseUser | null };
      act(() => {
        authStore.token = 'refreshed-token';
        onChange?.('refreshed-token', account);
      });
      await act(async () => {
        await result.current.signOut();
      });

      expect(isSessionTokenInactive('mock-token')).toBe(true);
      expect(isSessionTokenInactive('refreshed-token')).toBe(true);
    });

    it('keeps a late create after another tab clears the auth store', async () => {
      let onChange: ((token: string | null, record: unknown) => void) | undefined;
      const account = createMockUser({ id: 'storage-signout-account' });
      setupMockAuthState(true, account, callback => {
        onChange = callback;
        return vi.fn();
      });
      const { result } = renderUseAuthHook();
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      act(() => {
        const authStore = pb.authStore as { token: string; record: PocketBaseUser | null };
        authStore.token = '';
        authStore.record = null;
        onChange?.('', null);
      });
      recordCompletedSessionCreate('mock-token', 'projects', 'project-1');

      expect(takeCompletedSessionDestination(account.id)).toBe('/projects/project-1');
    });

    it('keeps a late create when the auth store switches accounts', async () => {
      let onChange: ((token: string | null, record: unknown) => void) | undefined;
      const account = createMockUser({ id: 'previous-account' });
      setupMockAuthState(true, account, callback => {
        onChange = callback;
        return vi.fn();
      });
      const { result } = renderUseAuthHook();
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      act(() => {
        const next = createMockUser({ id: 'next-account' });
        const authStore = pb.authStore as { token: string; record: PocketBaseUser | null };
        authStore.token = 'next-token';
        authStore.record = next;
        onChange?.('next-token', next);
      });
      recordCompletedSessionCreate('mock-token', 'projects', 'project-2');

      expect(takeCompletedSessionDestination(account.id)).toBe('/projects/project-2');
    });

    it('does not assign an old account’s create to a new expired account', async () => {
      let onChange: ((token: string | null, record: unknown) => void) | undefined;
      const first = createMockUser({ id: 'first-account' });
      setupMockAuthState(true, first, callback => {
        onChange = callback;
        return vi.fn();
      });
      const { result } = renderUseAuthHook();
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
      const unregister = registerSessionDraft('project-form', () => ({ title: 'First account' }));

      act(() => {
        const authStore = pb.authStore as {
          isValid: boolean;
          token: string;
          record: PocketBaseUser | null;
        };
        authStore.isValid = false;
        authStore.token = 'expired-second-token';
        authStore.record = createMockUser({ id: 'second-account' });
        onChange?.(authStore.token, authStore.record);
      });
      recordCompletedSessionCreate('mock-token', 'projects', 'first-project');

      expect(takeCompletedSessionDestination('second-account')).toBeUndefined();
      expect(takeCompletedSessionDestination('first-account')).toBe('/projects/first-project');
      expect(hasSessionDraft('project-form', 'second-account')).toBe(false);
      unregister();
    });

    it('should respond to auth store changes via PocketBase onChange', async () => {
      let storedCallback: ((token: string | null, record: unknown) => void) | null = null;

      // Setup mock that captures the onChange callback
      setupMockAuthState(false, null, callback => {
        storedCallback = callback;
        return vi.fn(); // cleanup function
      });

      const { result } = renderUseAuthHook();

      // Wait for initial setup
      await waitFor(() => {
        expect(result.current.initialCheckComplete).toBe(true);
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();

      // Simulate auth store change (login)
      const mockUser = createMockUser({
        id: 'changed-user-789',
        email: 'changed@example.com',
      });

      if (storedCallback) {
        // Update the mock auth store state
        const mockAuthStore = pb.authStore as {
          isValid: boolean;
          token: string;
          record: PocketBaseUser | null;
        };
        mockAuthStore.isValid = true;
        mockAuthStore.token = 'mock-token';
        mockAuthStore.record = mockUser;

        const callback = storedCallback as (token: string | null, record: unknown) => void;

        // Trigger the onChange callback with act
        act(() => {
          callback('mock-token', mockUser);
        });

        await waitFor(() => {
          expect(result.current.isAuthenticated).toBe(true);
          expect(result.current.user).toEqual(mockUser);
        });
      }
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
      const unregister = registerSessionDraft('/projects/new:diamond', () => ({ title: 'Unsent' }));
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

    it('should provide working signOut function', async () => {
      const mockUser = createMockUser({
        id: 'signout-user-123',
        email: 'signout@example.com',
      });

      setupMockAuthState(true, mockUser);

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
    });

    it('keeps a late create destination after explicit sign-out', async () => {
      const account = createMockUser({ id: 'late-create-account' });
      setupMockAuthState(true, account);
      const { result } = renderUseAuthHook();
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      await act(async () => {
        await result.current.signOut();
      });
      expect(takeSessionDraft('project-form', 'late-create-account')).toBeUndefined();
      recordCompletedSessionCreate('mock-token', 'projects', 'project-1');
      completeSessionRecovery('another-account');

      expect(takeCompletedSessionDestination('another-account')).toBeUndefined();
      expect(takeCompletedSessionDestination('late-create-account')).toBe('/projects/project-1');
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

    it('should handle signOut button clicks in components', async () => {
      const mockUser = createMockUser({
        id: 'button-user-123',
        email: 'button@example.com',
      });

      setupMockAuthState(true, mockUser);

      renderWithProviders(
        <AuthProvider>
          <AuthStateTestComponent />
        </AuthProvider>
      );

      // Wait for authenticated state
      await waitFor(() => {
        expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated');
      });

      // Click signOut button
      const signOutButton = screen.getByTestId('signout-btn');
      expect(signOutButton).not.toBeDisabled();

      const user = userEvent.setup();
      await user.click(signOutButton);

      // Verify PocketBase clear was called
      await waitFor(() => {
        expect(pb.authStore.clear).toHaveBeenCalled();
      });
    });

    it('should prevent multiple simultaneous signOut calls', async () => {
      const mockUser = createMockUser({
        id: 'multi-signout-user',
        email: 'multi@example.com',
      });

      setupMockAuthState(true, mockUser);

      const { result } = renderUseAuthHook();

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true);
      });

      // Call signOut multiple times quickly
      let results: Awaited<ReturnType<typeof result.current.signOut>>[] = [];
      await act(async () => {
        const promise1 = result.current.signOut();
        const promise2 = result.current.signOut();
        const promise3 = result.current.signOut();
        results = await Promise.all([promise1, promise2, promise3]);
      });

      // All should succeed (the implementation handles multiple calls gracefully)
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // Clear should have been called (implementation may batch these)
      expect(pb.authStore.clear).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('returns the PocketBase authStore cleanup callback when the hook unmounts', () => {
      const mockCleanup = vi.fn();
      const mockOnChange = vi.fn(() => mockCleanup);

      setupMockAuthState(false, null, mockOnChange);

      const { unmount } = renderUseAuthHook();

      // Verify onChange was called during setup
      expect(mockOnChange).toHaveBeenCalled();

      // Unmount should trigger cleanup
      unmount();

      // The cleanup function should have been returned
      expect(mockOnChange).toHaveReturnedWith(mockCleanup);
    });

    it('completes the initial auth check without leaving the hook loading', async () => {
      setupMockAuthState(false, null);

      const { result } = renderUseAuthHook();

      // Wait for auth initialization to complete
      await waitFor(() => {
        expect(result.current.initialCheckComplete).toBe(true);
      });

      // Should have completed without timeout in normal circumstances
      expect(result.current.isLoading).toBe(false);
      expect(result.current.initialCheckComplete).toBe(true);
    });

    it('should maintain referential stability of hook values', async () => {
      setupMockAuthState(false, null);

      const { result, rerender } = renderUseAuthHook();

      await waitFor(
        () => {
          expect(result.current.initialCheckComplete).toBe(true);
        },
        { timeout: 5000 }
      );

      const firstSignOut = result.current.signOut;

      // Rerender and check that signOut function remains stable
      rerender();

      expect(result.current.signOut).toBe(firstSignOut);
    }, 15000);
  });
});
