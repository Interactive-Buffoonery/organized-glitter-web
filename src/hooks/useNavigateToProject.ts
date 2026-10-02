import { notify } from '@/lib/notifications';

/**
 * @fileoverview Simplified Project Navigation Hooks
 *
 * This module provides streamlined navigation utilities for moving between
 * project-related pages. The hooks handle routing to project detail and edit
 * pages with optional navigation options and logging.
 *
 * Key Features:
 * - Simple project detail navigation
 * - Project edit page navigation
 * - Optional replace navigation mode
 * - Debug logging for navigation tracking
 * - Backward compatibility with legacy navigation context
 *
 * Navigation Hooks:
 * - useNavigateToProject: Navigate to project detail page
 * - useNavigateToProjectEdit: Navigate to project edit page
 *
 * Usage Examples:
 * ```typescript
 * const navigateToProject = useNavigateToProject();
 * const navigateToEdit = useNavigateToProjectEdit();
 *
 * // Navigate to project detail
 * const result = navigateToProject('project-id');
 * if (!result.success) {
 *   console.error('Navigation failed:', result.error);
 * }
 *
 * // Navigate with replace mode and success message
 * const result = navigateToProject('project-id', {
 *   replace: true,
 *   successMessage: 'Project loaded successfully!'
 * });
 *
 * // Navigate to edit page
 * navigateToEdit('project-id');
 * ```
 *
 * @author serabi
 * @since 2025-07-03
 * @version 1.0.0 - Simplified navigation system
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePostHog } from '@posthog/react';

import { createLogger } from '@/utils/logger';
import { AnalyticsEvent } from '@/services/analytics-events';
import type { ProjectDTO } from '@/services/types';
import type { DashboardFilterContext } from '@/hooks/mutations/useSaveNavigationContext';

const logger = createLogger('useNavigateToProject');

// Simplified navigation context for basic functionality
export interface NavigationContext {
  timestamp: number;
  preservationContext?: {
    scrollPosition?: number;
    timestamp?: number;
    editedProjectId?: string;
    isEditNavigation?: boolean;
    preEditPosition?: {
      index: number;
      page: number;
      totalItems: number;
    };
  };
  currentPage?: number;
}

// Navigation result interface
export interface NavigationResult {
  success: boolean;
  error?: string;
  projectId?: string;
}

// Enhanced navigation options to support all expected properties
interface NavigateToProjectOptions {
  replace?: boolean;
  projectData?: ProjectDTO | Partial<ProjectDTO>;
  successMessage?: string;
  showLoadingFeedback?: boolean;
  analytics?: {
    fromSort?: string;
    fromStatus?: string;
    position?: number;
  };
  /**
   * Snapshot of the dashboard filter/sort/pagination state at the moment the
   * user navigated. Forwarded to the project detail page so the back button
   * can hand it back to the dashboard and restore the same view.
   */
  dashboardContext?: DashboardFilterContext;
}

/**
 * Hook for navigating to project pages with proper result handling.
 * Returns NavigationResult to support error handling and success tracking.
 */
export const useNavigateToProject = () => {
  const navigate = useNavigate();
  const posthog = usePostHog();

  return useCallback(
    (projectId: string, options: NavigateToProjectOptions = {}): NavigationResult => {
      const {
        replace = false,
        projectData,
        successMessage,
        showLoadingFeedback,
        analytics,
        dashboardContext,
      } = options;

      try {
        logger.debug('🧭 Navigating to project', {
          projectId,
          replace,
          hasProjectData: !!projectData,
          hasSuccessMessage: !!successMessage,
          showLoadingFeedback,
          analytics,
        });

        // Show success message if provided
        if (successMessage) {
          logger.info('📢 Showing success message:', successMessage);
          notify({ kind: 'success', title: 'Project ready', description: successMessage });
        }

        if (analytics) {
          posthog.capture(AnalyticsEvent.DASHBOARD_PROJECT_OPENED, {
            from_sort: analytics.fromSort,
            from_status: analytics.fromStatus,
            position: analytics.position,
          });
        }

        // Create navigation state with optimistic data + dashboard snapshot.
        // The detail page forwards `dashboardContext` to its back button so
        // returning to /dashboard restores filters, sort, page, and scroll.
        const navigationState = {
          fromNavigation: true,
          projectId,
          projectData,
          timestamp: Date.now(),
          dashboardContext,
        };

        // Perform navigation with optimistic state
        logger.debug('🚀 Executing navigation to project detail', {
          path: `/projects/${projectId}`,
          replace,
          hasOptimisticData: !!projectData,
          currentLocation: window.location.pathname,
        });

        // Log the current URL before navigation for debugging
        const beforeNavigation = {
          currentUrl: window.location.href,
          currentPathname: window.location.pathname,
          targetPath: `/projects/${projectId}`,
          timestamp: Date.now(),
        };

        logger.debug('Navigation context before execute:', beforeNavigation);

        // Force navigation by using window.location if replace is true and we're coming from /projects/new
        if (replace && window.location.pathname === '/projects/new') {
          logger.debug('🔄 Using window.location.replace for reliable navigation from form');
          window.location.replace(`/projects/${projectId}`);
          // Return immediately since window.location.replace will reload the page
          return {
            success: true,
            projectId,
          };
        } else {
          logger.debug('🧭 Using React Router navigate function');
          navigate(`/projects/${projectId}`, {
            replace,
            state: navigationState,
          });
        }

        // Add verification to check if navigation actually happened
        setTimeout(() => {
          const afterNavigation = {
            currentUrl: window.location.href,
            currentPathname: window.location.pathname,
            expectedPath: `/projects/${projectId}`,
            navigationSuccess: window.location.pathname === `/projects/${projectId}`,
            timestamp: Date.now(),
          };

          logger.debug('Navigation verification:', afterNavigation);

          if (!afterNavigation.navigationSuccess) {
            logger.error('❌ Navigation verification failed - URL did not change as expected', {
              expected: `/projects/${projectId}`,
              actual: window.location.pathname,
              beforeNavigation,
              afterNavigation,
              userAgent: navigator.userAgent,
              browserInfo: {
                cookieEnabled: navigator.cookieEnabled,
                onLine: navigator.onLine,
                language: navigator.language,
              },
            });

            // Attempt a fallback navigation
            logger.debug('Attempting fallback navigation via window.location');
            try {
              window.location.href = `/projects/${projectId}`;
            } catch (fallbackError) {
              logger.error('❌ Fallback navigation failed:', fallbackError);
            }
          } else {
            logger.info('✅ Navigation verification successful - URL changed as expected');
          }
        }, 150); // Slightly longer delay for verification

        logger.info('✅ Navigation executed successfully', {
          projectId,
          path: `/projects/${projectId}`,
        });

        // Return success result
        return {
          success: true,
          projectId,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown navigation error';
        logger.error('❌ Navigation failed:', { projectId, error: errorMessage });

        // Show error toast for navigation failures
        notify({
          kind: 'error',
          title: 'Navigation Error',
          description: 'Unable to navigate to project. Please try again.',
        });

        return {
          success: false,
          error: errorMessage,
          projectId,
        };
      }
    },
    [navigate, posthog]
  );
};
