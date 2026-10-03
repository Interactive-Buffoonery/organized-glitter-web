/* eslint-disable react-refresh/only-export-components */
/**
 * Recently Edited Context
 *
 * Simple context for tracking the most recently edited project in the dashboard.
 * Extracted from the monolithic DashboardFiltersContext to improve performance
 * and reduce unnecessary re-renders.
 *
 * @author @serabi
 * @created 2025-08-02
 */

import React, { createContext, useContext, useState, useMemo, useCallback, ReactNode } from 'react';
import type { RecentlyEditedContextType } from './types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('RecentlyEditedProvider');

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const RecentlyEditedContext = createContext<RecentlyEditedContextType | null>(null);

// Re-export types for convenience
export type { RecentlyEditedContextType } from './types';

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface RecentlyEditedProviderProps {
  children: ReactNode;
}

/**
 * RecentlyEditedProvider component that provides recently edited project context
 *
 * Manages the state of the most recently edited project in the dashboard.
 * This context is designed to be lightweight and focused on a single piece
 * of state without complex side effects.
 */
export const RecentlyEditedProvider: React.FC<RecentlyEditedProviderProps> = ({ children }) => {
  // Simple state for tracking recently edited project
  const [recentlyEditedProjectId, setRecentlyEditedProjectId] = useState<string | null>(null);

  /**
   * Clear the recently edited project state
   */
  const clearRecentlyEdited = useCallback(() => {
    logger.debug('Clearing recently edited project state');
    setRecentlyEditedProjectId(null);
  }, []);

  /**
   * Check if a specific project is the recently edited one
   */
  const isRecentlyEdited = useCallback(
    (projectId: string): boolean => {
      return recentlyEditedProjectId === projectId;
    },
    [recentlyEditedProjectId]
  );

  /**
   * Enhanced setRecentlyEditedProjectId with logging
   */
  const setRecentlyEditedProjectIdWithLogging = useCallback(
    (id: string | null) => {
      setRecentlyEditedProjectId(prevId => {
        logger.debug('Setting recently edited project', {
          previousId: prevId,
          newId: id,
        });
        return id;
      });
    },
    [] // Empty dependency array - optimal performance with no recreations
  );

  // Memoized context value to prevent unnecessary re-renders
  const contextValue: RecentlyEditedContextType = useMemo(
    () => ({
      recentlyEditedProjectId,
      setRecentlyEditedProjectId: setRecentlyEditedProjectIdWithLogging,
      clearRecentlyEdited,
      isRecentlyEdited,
    }),
    [
      recentlyEditedProjectId,
      setRecentlyEditedProjectIdWithLogging,
      clearRecentlyEdited,
      isRecentlyEdited,
    ]
  );

  return (
    <RecentlyEditedContext.Provider value={contextValue}>{children}</RecentlyEditedContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Main recently edited hook - covers most use cases
 * @throws Error if used outside of RecentlyEditedProvider
 */
export const useRecentlyEdited = (): RecentlyEditedContextType => {
  const context = useContext(RecentlyEditedContext);
  if (!context) {
    throw new Error('useRecentlyEdited must be used within a RecentlyEditedProvider');
  }
  return context;
};
