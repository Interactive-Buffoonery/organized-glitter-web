import { useQuery } from '@tanstack/react-query';
import { resolveFileUrl } from '@/lib/pocketbase';
import { projectsService } from '@/services/pocketbase/projects.service';
import { defaultQueryRetry } from '@/lib/queryClient';
import { createLogger } from '@/utils/logger';
import { toUserDateString } from '@/utils/date/timezoneUtils';
import { ProjectType } from '@/types/project';
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';
import { queryKeys } from './queryKeys';

const projectDetailLogger = createLogger('useProjectDetailQuery');

/**
 * Helper function to normalize database date strings to YYYY-MM-DD.
 * Strips time components from ISO datetime strings.
 */
const normalizeDateField = (dbDate: string | undefined): string | undefined => {
  if (!dbDate) return undefined;

  try {
    if (dbDate.includes('T') || dbDate.includes(' ')) {
      return dbDate.split('T')[0].split(' ')[0];
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dbDate)) {
      return dbDate;
    }
    const date = new Date(dbDate);
    return !isNaN(date.getTime()) ? (toUserDateString(date) ?? dbDate) : dbDate;
  } catch {
    return dbDate;
  }
};

/**
 * Fetches a single project with all related data via the service's
 * getProjectDetail method, then normalises dates for form display.
 */
const fetchProjectDetail = async (
  projectId: string,
  _userTimezone: string = 'UTC'
): Promise<ProjectType> => {
  const project = await projectsService.getProjectDetail(projectId);

  return {
    ...project,
    title: project.title || 'Untitled Project',
    // Normalize dates to YYYY-MM-DD for HTML5 date inputs
    datePurchased: normalizeDateField(project.datePurchased),
    dateReceived: normalizeDateField(project.dateReceived),
    dateStarted: normalizeDateField(project.dateStarted),
    dateCompleted: normalizeDateField(project.dateCompleted),
    // Resolve image filename to a full URL
    imageUrl: project.imageUrl
      ? resolveFileUrl('projects', project.id, project.imageUrl)
      : undefined,
    progressNotes: [], // Fetched separately by ProgressNotes component
  };
};

/**
 * React Query hook for fetching project detail data
 * Now includes authentication state dependencies to prevent race conditions
 */
export const useProjectDetailQuery = (
  projectId: string | undefined,
  isAuthenticated?: boolean,
  initialCheckComplete?: boolean,
  userTimezone: string = 'UTC'
) => {
  // Only log auth state once when query is first enabled
  const isQueryEnabled = !!projectId && (isAuthenticated ?? true) && (initialCheckComplete ?? true);

  return useQuery({
    queryKey: queryKeys.projects.detail(projectId!),
    queryFn: () => fetchProjectDetail(projectId!, userTimezone),
    enabled: isQueryEnabled,
    ...queryFreshness('frequent'),
    retry: (failureCount, error) => {
      // Log retry attempts for debugging
      projectDetailLogger.debug('Retry attempt:', {
        failureCount,
        error,
        errorStatus:
          error && typeof error === 'object' && 'status' in error ? error.status : 'unknown',
      });

      // Handle authentication errors - retry up to 2 times
      if (error && typeof error === 'object' && 'status' in error) {
        if (error.status === 401 || error.status === 403) {
          projectDetailLogger.debug('Auth error detected, retrying...', { failureCount });
          return failureCount < 2;
        }

        // Handle 404 errors more carefully
        if (error.status === 404) {
          // If the error message suggests it's an expand issue, allow retry
          const errorMessage = 'message' in error ? String(error.message) : '';
          if (errorMessage.includes('expand') || errorMessage.includes('relation')) {
            projectDetailLogger.debug('Expand-related 404, retrying...', {
              failureCount,
            });
            return failureCount < 2; // Allow some retries for expand failures
          }
          projectDetailLogger.debug('True 404 - project not found, not retrying');
          return false; // True 404 - project doesn't exist
        }
      }

      return defaultQueryRetry(failureCount, error);
    },
  });
};
