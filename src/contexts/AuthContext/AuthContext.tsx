/* eslint-disable react-refresh/only-export-components */
/**
 * Auth Context
 *
 * Authentication provider component that manages user authentication state.
 *
 * @author @serabi
 * @created 2025-01-01
 */

import React, { createContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { ClientResponseError, isTokenExpired } from 'pocketbase';
import {
  isAuthenticated as checkIsAuthenticated,
  getCurrentUser,
  onAuthChange,
  logout as authLogout,
} from '@/services/auth';
import type { AuthContextType, AuthProviderProps, PocketBaseUser } from './types';
import { createLogger } from '@/utils/logger';
import { queryClient } from '@/lib/queryClient';
// pb-boundary-ignore
import { pb } from '@/lib/pocketbase';
import {
  captureSessionDrafts,
  clearSessionDrafts,
  completeSessionRecovery,
  activateSessionToken,
  markSessionTokenInactive,
  reportInvalidSession,
  retainSignedOutCreateTokens,
  subscribeToCompletedSessionCreate,
  subscribeToCompletedSessionOtherCreate,
  subscribeToInvalidSession,
  takeCompletedSessionOtherCreate,
} from '@/services/auth/sessionRecovery';
import { POCKETBASE_URL } from '@/lib/pocketbaseConfig';
import { UsersService } from '@/services/pocketbase/users.service';
import { notify } from '@/lib/notifications';
import { clearAccountDrafts } from '@/hooks/drafts/formDraftStorage';
import {
  allCompaniesOptions,
  artistsOptions,
  tagsOptions,
} from '@/hooks/queries/shared/queryOptionsFactory';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { invalidateStatsQueries } from '@/hooks/mutations/statsInvalidation';

const authLogger = createLogger('AuthProvider');

const retireSessionTokens = (tokens: Set<string>, accountId: string | null) => {
  if (accountId) retainSignedOutCreateTokens(accountId, tokens);
  for (const token of tokens) markSessionTokenInactive(token);
  tokens.clear();
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  authLogger.debug('AuthProvider component rendering/re-rendering...');
  const [user, setUser] = useState<PocketBaseUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [initialCheckComplete, setInitialCheckComplete] = useState(false);
  const isSigningOut = useRef(false);
  const isInitializedRef = useRef(false);
  const activeUserIdRef = useRef<string | null>(null);
  const sessionTokensRef = useRef(new Set<string>());
  const sessionGenerationRef = useRef(0);

  useEffect(() => {
    // Prevent double initialization
    if (isInitializedRef.current) {
      authLogger.debug('AuthProvider already initialized, skipping setup');
      return;
    }

    authLogger.debug(`AuthProvider useEffect running. Setting up fresh auth listeners.`);
    isInitializedRef.current = true;
    setIsLoading(true);

    const showCompletedOtherCreate = (accountId: string, eventCollection?: string) => {
      if (pb.authStore.record?.id !== accountId) return;
      const collections = new Set(takeCompletedSessionOtherCreate(accountId));
      if (eventCollection) collections.add(eventCollection);
      if (collections.size === 0) return;
      for (const collection of collections) {
        if (collection === 'companies') {
          void queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
        } else if (collection === 'artists') {
          void queryClient.invalidateQueries({ queryKey: queryKeys.artists.all });
        } else if (collection === 'progress_notes') {
          void queryClient.invalidateQueries({ queryKey: queryKeys.progressNotes.all });
          void queryClient.invalidateQueries({ queryKey: queryKeys.notesFeed.all });
          void queryClient.invalidateQueries({ queryKey: queryKeys.projects.details() });
          void queryClient.invalidateQueries({ queryKey: queryKeys.stats.overview(accountId) });
        } else if (collection === 'coloring_page_progress_notes') {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.coloring.pageProgressNotes.all,
          });
          void queryClient.invalidateQueries({ queryKey: queryKeys.notesFeed.all });
          void queryClient.invalidateQueries({ queryKey: queryKeys.coloring.pages.all });
          void queryClient.invalidateQueries({ queryKey: queryKeys.coloring.books.all });
          void queryClient.invalidateQueries({ queryKey: queryKeys.stats.overview(accountId) });
        } else {
          void queryClient.invalidateQueries();
        }
      }
      notify({
        kind: 'info',
        title: 'Save completed',
        description: 'A save from your previous session completed. Check it before trying again.',
      });
    };
    const removeCompletedOtherCreateListener =
      subscribeToCompletedSessionOtherCreate(showCompletedOtherCreate);
    const removeCompletedCreateListener = subscribeToCompletedSessionCreate(
      (accountId, destination) => {
        if (pb.authStore.record?.id !== accountId) return;
        if (destination.startsWith('/projects/')) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.projects.lists() });
          void queryClient.invalidateQueries({ queryKey: queryKeys.tags.stats() });
          invalidateStatsQueries(queryClient, 'diamond');
        } else if (destination.startsWith('/coloring/')) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.coloring.books.all });
          void queryClient.invalidateQueries({ queryKey: queryKeys.coloring.pages.all });
          void queryClient.invalidateQueries({ queryKey: queryKeys.coloring.tags.stats() });
          invalidateStatsQueries(queryClient, 'coloring');
        }
      }
    );

    // Create AbortController for proper cleanup
    const abortController = new AbortController();

    // Add timeout protection to prevent infinite loading
    // Extended timeout for production environments with slower networks
    const timeoutDuration = import.meta.env.PROD ? 30000 : 15000;
    const authTimeout = setTimeout(() => {
      authLogger.warn(`Auth initialization timed out after ${timeoutDuration / 1000} seconds`);
      authLogger.error(
        'Auth timeout - this may indicate network issues or slow PocketBase response'
      );
      if (!abortController.signal.aborted) {
        setIsLoading(false);
        setInitialCheckComplete(true);
      }
    }, timeoutDuration);

    // Initialize PocketBase auth state
    const initializeAuth = () => {
      try {
        // Check if already authenticated
        const isValid = checkIsAuthenticated();
        const currentUser = getCurrentUser();

        authLogger.debug('Initial auth check:', {
          isValid,
          hasUser: !!currentUser,
          userId: currentUser?.id,
        });

        if (!abortController.signal.aborted) {
          if (isValid && currentUser) {
            activateSessionToken(pb.authStore.token);
            sessionTokensRef.current.add(pb.authStore.token);
            activeUserIdRef.current = currentUser.id;
            completeSessionRecovery(currentUser.id);
            showCompletedOtherCreate(currentUser.id);
            authLogger.debug('Setting initial user state:', currentUser.id);
            authLogger.debug('Initial auth check: User IS valid and present.', {
              id: currentUser.id,
              email: currentUser.email,
              username: currentUser.username,
            });
            setUser(currentUser);
            setIsAuthenticated(true);

            // Fire-and-forget metadata prefetching for instant dashboard loading
            authLogger.debug('Starting metadata prefetch for user:', currentUser.id);
            queryClient.prefetchQuery(allCompaniesOptions(currentUser.id));
            queryClient.prefetchQuery(artistsOptions(currentUser.id));
            queryClient.prefetchQuery(tagsOptions(currentUser.id));
          } else {
            if (pb.authStore.token) pb.authStore.clear();
            authLogger.debug('No valid session found');
            authLogger.debug('Initial auth check: User IS NOT valid or present.');
            setUser(null);
            setIsAuthenticated(false);
          }

          setIsLoading(false);
          setInitialCheckComplete(true);
        }

        // Set up auth store change listener - ALWAYS set this up fresh
        authLogger.debug('Setting up fresh auth onChange listener');
        const removeListener = onAuthChange((token, record) => {
          sessionGenerationRef.current += 1;
          authLogger.debug('Auth onChange triggered.', {
            tokenExists: !!token,
            recordExists: !!record,
            recordId: record?.id,
          });
          // Skip processing if we're in the middle of signing out or component is unmounted
          if (isSigningOut.current || abortController.signal.aborted) {
            authLogger.debug('Skipping auth change during signout or after unmount');
            return;
          }

          authLogger.debug('Auth state changed:', {
            hasToken: !!token,
            hasRecord: !!record,
            userId: record?.id,
          });

          if (token && record && !checkIsAuthenticated()) {
            reportInvalidSession(token);
            return;
          }

          if (token && record) {
            if (activeUserIdRef.current && activeUserIdRef.current !== record.id) {
              retireSessionTokens(sessionTokensRef.current, activeUserIdRef.current);
              queryClient.clear();
            }
            activeUserIdRef.current = record.id;
            sessionTokensRef.current.add(token);
            activateSessionToken(token);
            completeSessionRecovery(record.id);
            showCompletedOtherCreate(record.id);
            setUser(record);
            setIsAuthenticated(true);
            setIsLoading(false);
            setInitialCheckComplete(true);
          } else {
            retireSessionTokens(sessionTokensRef.current, activeUserIdRef.current);
            if (activeUserIdRef.current) queryClient.clear();
            activeUserIdRef.current = null;
            authLogger.debug('Clearing user state');
            setUser(null);
            setIsAuthenticated(false);
            setIsLoading(false);
            setInitialCheckComplete(true);
          }
        });

        return removeListener;
      } catch (error) {
        authLogger.error('Error during auth initialization:', error);
        if (!abortController.signal.aborted) {
          setIsLoading(false);
          setInitialCheckComplete(true);
        }
        return () => {};
      } finally {
        clearTimeout(authTimeout);
      }
    };

    const removeInvalidSessionListener = subscribeToInvalidSession(token => {
      if (token !== pb.authStore.token || !pb.authStore.record) return;
      const invalidAccountId = pb.authStore.record.id;
      const activeAccountId = activeUserIdRef.current;
      retireSessionTokens(sessionTokensRef.current, activeAccountId);
      markSessionTokenInactive(token);
      retainSignedOutCreateTokens(invalidAccountId, [token]);
      if (!activeAccountId || activeAccountId === invalidAccountId) {
        captureSessionDrafts(invalidAccountId, token);
      }
      void queryClient.cancelQueries();
      pb.authStore.clear();
    });
    const removeListener = initializeAuth();

    let refreshPromise: Promise<void> | null = null;
    const checkSession = () => {
      const token = pb.authStore.token;
      if (!token || !pb.authStore.record || refreshPromise) return;
      if (!pb.authStore.isValid) {
        reportInvalidSession(token);
        return;
      }
      if (!isTokenExpired(token, 120)) return;
      const generation = sessionGenerationRef.current;
      refreshPromise = UsersService.refreshDetachedSession(token, pb.authStore.record)
        .then(result => {
          if (token === pb.authStore.token && generation === sessionGenerationRef.current) {
            pb.authStore.save(result.token, result.record);
          }
        })
        .catch(error => {
          if (
            token === pb.authStore.token &&
            generation === sessionGenerationRef.current &&
            ((error instanceof ClientResponseError && error.status === 401) ||
              !pb.authStore.isValid)
          ) {
            reportInvalidSession(token);
          } else {
            authLogger.warn('Session refresh failed; keeping the current session', error);
          }
        })
        .finally(() => {
          refreshPromise = null;
        });
    };
    const checkVisibleSession = () => {
      if (document.visibilityState === 'visible') checkSession();
    };
    const sessionInterval = window.setInterval(checkVisibleSession, 60_000);
    document.addEventListener('visibilitychange', checkVisibleSession);
    window.addEventListener('focus', checkVisibleSession);
    checkVisibleSession();

    // Cleanup function
    return () => {
      authLogger.debug('Cleaning up auth listeners - removing PocketBase onChange listener');
      clearTimeout(authTimeout);
      abortController.abort();
      isInitializedRef.current = false; // Reset initialization flag
      removeListener();
      removeInvalidSessionListener();
      removeCompletedOtherCreateListener();
      removeCompletedCreateListener();
      window.clearInterval(sessionInterval);
      document.removeEventListener('visibilitychange', checkVisibleSession);
      window.removeEventListener('focus', checkVisibleSession);
    };
  }, []);

  const signOut = useCallback(async () => {
    // Prevent multiple simultaneous logout attempts
    if (isSigningOut.current) {
      authLogger.debug('SignOut already in progress, skipping...');
      return { success: true, error: null };
    }

    isSigningOut.current = true;
    setIsLoading(true);
    const departingUserId = user?.id ?? getCurrentUser()?.id;

    try {
      authLogger.debug('Starting logout process...');
      authLogout();
      retireSessionTokens(sessionTokensRef.current, departingUserId ?? null);
      sessionGenerationRef.current += 1;
      clearSessionDrafts();
      activeUserIdRef.current = null;
      setUser(null);
      setIsAuthenticated(false);
      queryClient.clear();

      if (
        departingUserId &&
        !clearAccountDrafts({
          backendUrl: POCKETBASE_URL,
          accountId: departingUserId,
        })
      ) {
        notify({
          kind: 'warning',
          title: 'Local drafts could not be cleared',
          description:
            'Clear this site’s browser data to remove unfinished drafts from this device.',
        });
      }

      authLogger.debug('Logout completed successfully');
      return { success: true, error: null };
    } catch (err) {
      authLogger.error('Logout error:', err);

      if (err instanceof Error) {
        return { success: false, error: new Error(err.message) };
      }

      return { success: false, error: new Error('An unexpected error occurred during logout') };
    } finally {
      setIsLoading(false);
      // Reset the signing out flag after a brief delay to prevent race conditions
      setTimeout(() => {
        isSigningOut.current = false;
      }, 100);
    }
  }, [user?.id]);

  // Memoize the context value to prevent unnecessary re-renders
  const value = useMemo(
    () => ({
      user,
      isAuthenticated,
      isLoading,
      initialCheckComplete,
      signOut,
    }),
    [user, isAuthenticated, isLoading, initialCheckComplete, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
