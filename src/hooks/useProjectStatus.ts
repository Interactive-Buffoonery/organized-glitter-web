import { useCallback, useMemo } from 'react';
import { notifyError, notifyInfo, notifySuccess } from '@/lib/notifications';
import { ProjectType, ProjectStatus } from '@/types/project';
import { projectsService } from '@/services/pocketbase/projects.service';
import { createLogger } from '@/utils/logger';

const logger = createLogger('useProjectStatus');

// Extended toast handlers interface
interface ExtendedToastHandlers {
  showSuccess?: (message: string) => void;
  showError?: (message: string) => void;
  onSuccess?: (options: { title: string; description: string }) => void;
}

/**
 * @fileoverview This is the consolidated version of useProjectStatus
 * that merges functionality from both the .ts and .tsx versions.
 * It provides both utility functions and status update functionality.
 */

const statusOptions = [
  'wishlist',
  'purchased',
  'stash',
  'kitted',
  'progress',
  'onhold',
  'completed',
  'archived',
  'destashed',
] as const;
type StatusType = (typeof statusOptions)[number] | string;

const STATUS_LABELS: Record<string, string> = {
  wishlist: 'Wishlist',
  purchased: 'Purchased - Not Received',
  stash: 'In Stash',
  kitted: 'Kitted Up, Not Started',
  progress: 'In Progress',
  onhold: 'On Hold',
  completed: 'Completed',
  archived: 'Archived',
  destashed: 'Destashed',
};

const STATUS_COLORS: Record<string, string> = {
  wishlist: 'bg-rose-500 text-white shadow-rose-500/30 dark:bg-rose-600 dark:shadow-rose-500/40',
  purchased: 'bg-sky-500 text-white shadow-sky-500/30 dark:bg-sky-600 dark:shadow-sky-500/40',
  stash:
    'bg-orange-500 text-white shadow-orange-500/30 dark:bg-orange-600 dark:shadow-orange-500/40',
  kitted: 'bg-teal-500 text-white shadow-teal-500/30 dark:bg-teal-600 dark:shadow-teal-500/40',
  progress:
    'bg-diamond-500 text-white shadow-diamond-500/30 dark:bg-diamond-600 dark:shadow-diamond-500/40',
  onhold: 'bg-amber-500 text-white shadow-amber-500/30 dark:bg-amber-600 dark:shadow-amber-500/40',
  completed:
    'bg-emerald-500 text-white shadow-emerald-500/30 dark:bg-emerald-600 dark:shadow-emerald-500/40',
  archived: 'bg-muted-foreground text-background shadow-muted-foreground/30',
  destashed: 'bg-rose-500 text-white shadow-rose-500/30 dark:bg-rose-600 dark:shadow-rose-500/40',
};

interface StatusUtils {
  getStatusLabel: (status: StatusType) => string;
  getStatusColor: (status: StatusType) => string;
  statusOptions: readonly string[];
  handleUpdateStatus?: (newStatus: ProjectStatus) => Promise<boolean>;
}

/**
 * Hook that provides utility functions for working with project statuses
 * and optionally provides functionality for updating a project's status
 *
 * @param project Optional project object. If provided, the hook will include
 *                status update functionality.
 * @returns Object containing status utility functions and update handler
 */
export const useProjectStatus = (project?: ProjectType | null): StatusUtils => {
  // Use the singleton PocketBase service instance

  // Create a toast handler that matches the expected service interface
  // Wrap in useMemo to prevent it from changing on every render
  const toastHandlers = useMemo<ExtendedToastHandlers>(
    () => ({
      showSuccess: (message: string) => {
        notifySuccess('Project status updated', message);
      },
      showError: (message: string) => {
        notifyError('Project status update failed', message);
      },
      onSuccess: options => {
        notifyInfo(options.title, options.description);
      },
    }),
    []
  );

  // Status update handler - only available if project is provided
  const handleUpdateStatus = useCallback(
    async (newStatus: ProjectStatus): Promise<boolean> => {
      if (!project) return false;
      if (!project.id) {
        logger.error('Error: Project ID is undefined');
        toastHandlers.showError?.('Invalid project ID. Please try refreshing the page.');
        return false;
      }

      try {
        logger.debug(`Updating project ${project.id} status to ${newStatus}`);

        await projectsService.update(project.id, { status: newStatus });

        logger.debug(`Project ${project.id} status updated successfully`);
        toastHandlers.showSuccess?.('Project status updated');

        return true;
      } catch (error) {
        const errorMsg = 'Failed to update project status';
        logger.error(errorMsg, error);
        toastHandlers.showError?.(errorMsg);
        return false;
      }
    },
    [project, toastHandlers]
  );

  // Core utility functions
  return useMemo(() => {
    const utils: StatusUtils = {
      statusOptions,

      /**
       * Returns a human-readable label for a project status
       */
      getStatusLabel: (status: StatusType): string => STATUS_LABELS[status] ?? status,

      /**
       * Returns Tailwind CSS classes for styling based on project status
       * Uses custom palette colors with pill badge styling
       */
      getStatusColor: (status: StatusType): string =>
        STATUS_COLORS[status] ?? 'bg-muted text-muted-foreground shadow-muted/30',
    };

    // Only add the update handler if a project was provided
    if (project) {
      utils.handleUpdateStatus = handleUpdateStatus;
    }

    return utils;
  }, [project, handleUpdateStatus]);
};
