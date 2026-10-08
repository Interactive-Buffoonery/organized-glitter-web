/**
 * @fileoverview Project Detail Page Component
 *
 * Main page component for displaying individual project details. Handles authentication,
 * navigation state management, and project data fetching with comprehensive error handling.
 * Integrates with the simplified navigation system for smooth user experience.
 *
 * Key Features:
 * - URL parameter-based project identification
 * - Authentication state verification
 * - Optimistic navigation data handling
 * - Comprehensive error boundary protection
 * - Mobile-responsive layout integration
 * - Navigation context preservation for edit workflows
 *
 * Navigation Integration:
 * - Handles navigation state from dashboard
 * - Preserves context for edit page transitions
 * - Supports optimistic navigation with cached data
 * - Back navigation with position restoration
 *
 * Error Handling:
 * - Project not found scenarios
 * - Authentication failures
 * - Network and loading errors
 * - Graceful degradation with user feedback
 *
 * @author serabi
 * @since 2025-07-03
 * @version 1.0.0 - Simplified navigation integration
 */

import { sessionDraftKeys } from '@/services/auth/sessionDraftKeys';
import { useState } from 'react';
import { usePostHog } from '@posthog/react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import MainLayout from '@/components/layout/MainLayout';
import { useIsMobile } from '@/hooks/use-mobile';
import { useProjectDetailQuery } from '@/hooks/queries/useProjectDetailQuery';
import type { NavigationContext } from '@/hooks/useNavigateToProject';
import ProjectEditDrawer from '@/components/projects/ProjectEditDrawer';
import { hasSessionDraft } from '@/services/auth/sessionRecovery';
import type { DashboardFilterContext } from '@/hooks/mutations/useSaveNavigationContext';
import { ProjectStatus, ProjectType } from '@/types/project';

import LoadingState from '@/components/projects/LoadingState';
import ProjectNotFound from '@/components/projects/ProjectNotFound';
import ProjectDetailView from '@/components/projects/ProjectDetailView';
import { ProjectContentErrorBoundary } from '@/components/error/ComponentErrorBoundaries';
import { useAppReady } from '@/hooks/useAppReady';
import { usePageMetadata } from '@/hooks/usePageMetadata';
import {
  useArchiveProjectMutation,
  useDeleteProjectMutation,
  useUpdateProjectNotesSectionMutation,
} from '@/hooks/mutations/useProjectDetailMutations';
import { useUpdateProjectStatus } from '@/hooks/mutations/useUpdateProjectStatus';
import { notify } from '@/lib/notifications';
import { AnalyticsEvent } from '@/services/analytics-events';

/**
 * ProjectDetail Component
 *
 * Main component for rendering individual project detail pages. Orchestrates
 * authentication checks, project data fetching, navigation state handling,
 * and error boundaries for a robust user experience.
 *
 * Features:
 * - Automatic authentication verification with redirects
 * - Project data fetching with React Query integration
 * - Navigation state preservation for edit workflows
 * - Comprehensive error handling and loading states
 * - Mobile-responsive layout integration
 *
 * @returns JSX.Element The complete project detail page
 */
const ProjectDetail = () => {
  const posthog = usePostHog();
  useAppReady();
  const { id } = useParams<{ id: string }>();
  const projectId = id || '';
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user, isAuthenticated, initialCheckComplete, isLoading: authLoading } = useAuth();
  const [editDrawerOpen, setEditDrawerOpen] = useState(() =>
    user?.id ? hasSessionDraft(sessionDraftKeys.projectEdit(projectId, 'drawer'), user.id) : false
  );

  // Check for optimistic navigation data in location state
  const navigationState = location.state as {
    fromNavigation?: boolean;
    projectId?: string;
    projectData?: ProjectType;
    timestamp?: number;
    navigationContext?: NavigationContext;
    /** Snapshot of the dashboard view at navigation time. Forwarded back. */
    dashboardContext?: DashboardFilterContext;
    from?: string;
    randomizerState?: {
      selectedProjects: string[];
      shareUrl: string;
    };
  } | null;

  // Check if we have optimistic project data from navigation
  const hasOptimisticData =
    navigationState?.fromNavigation &&
    navigationState?.projectData &&
    navigationState?.projectId === projectId;

  const { data: project, isLoading: loading } = useProjectDetailQuery(
    projectId,
    isAuthenticated,
    initialCheckComplete
  );
  const updateStatusMutation = useUpdateProjectStatus();
  const updateNotesMutation = useUpdateProjectNotesSectionMutation();
  const archiveProjectMutation = useArchiveProjectMutation();
  const deleteProjectMutation = useDeleteProjectMutation();

  const submitting =
    updateStatusMutation.isPending ||
    updateNotesMutation.isPending ||
    archiveProjectMutation.isPending ||
    deleteProjectMutation.isPending;

  const handleUpdateStatus = async (newStatus: ProjectStatus): Promise<boolean> => {
    if (!projectId || !project) return false;

    try {
      await updateStatusMutation.mutateAsync({
        projectId,
        nextStatus: newStatus,
        currentStatus: project.status,
      });
      posthog.capture(AnalyticsEvent.PROJECT_STATUS_CHANGED, { new_status: newStatus });
      notify({
        kind: 'info',
        title: 'Status Updated',
        description: `Project status changed to ${newStatus}`,
      });
      return true;
    } catch (error) {
      notify({
        kind: 'error',
        title: 'Failed to update project status',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
      return false;
    }
  };

  const handleUpdateNotes = async (newNotes: string): Promise<void> => {
    if (!projectId || !project) return;
    await updateNotesMutation.mutateAsync({ projectId, notes: newNotes });
  };

  const handleArchive = async (): Promise<boolean> => {
    if (!projectId) return false;

    try {
      await archiveProjectMutation.mutateAsync({ projectId });
      posthog.capture(AnalyticsEvent.PROJECT_ARCHIVED);
      notify({
        kind: 'info',
        title: 'Project Archived',
        description: 'Your project has been archived successfully',
      });
      navigate('/dashboard', { replace: true });
      return true;
    } catch (error) {
      notify({
        kind: 'error',
        title: 'Archive project failed',
        description: error instanceof Error ? error.message : 'Failed to archive project',
      });
      return false;
    }
  };

  const handleDelete = async (): Promise<boolean> => {
    if (!projectId) return false;

    try {
      await deleteProjectMutation.mutateAsync({ projectId, title: project?.title });
      posthog.capture(AnalyticsEvent.PROJECT_DELETED);
      notify({
        kind: 'info',
        title: 'Project Deleted',
        description: 'Your project has been permanently deleted',
      });
      navigate('/dashboard', { replace: true });
      return true;
    } catch (error) {
      notify({
        kind: 'error',
        title: 'Delete project failed',
        description: error instanceof Error ? error.message : 'Failed to delete project',
      });
      return false;
    }
  };

  const navigateToEdit = async () => {
    setEditDrawerOpen(true);
  };

  // Use optimistic data while loading if available
  const effectiveProject = project || (hasOptimisticData ? navigationState?.projectData : null);
  const effectiveLoading = loading && !hasOptimisticData;
  const pageTitle = effectiveProject
    ? `${effectiveProject.title || 'Untitled project'} | Organized Glitter`
    : !effectiveLoading && isAuthenticated && initialCheckComplete
      ? 'Project not found | Organized Glitter'
      : 'Project details | Organized Glitter';
  usePageMetadata({ title: pageTitle });

  if (effectiveLoading || authLoading || !initialCheckComplete) {
    return (
      <MainLayout>
        <LoadingState />
      </MainLayout>
    );
  }

  // Show not found state if project doesn't exist (but only after auth is confirmed and no optimistic data)
  if (
    !effectiveProject &&
    !loading &&
    !hasOptimisticData &&
    isAuthenticated &&
    initialCheckComplete
  ) {
    return (
      <MainLayout>
        <ProjectNotFound />
      </MainLayout>
    );
  }

  if (!effectiveProject) {
    return (
      <MainLayout>
        <LoadingState />
      </MainLayout>
    );
  }

  // Cast project to ProjectType to ensure type safety
  const typedProject: ProjectType = effectiveProject as ProjectType;

  return (
    <MainLayout>
      <div className="text-foreground">
        <ProjectContentErrorBoundary projectId={projectId}>
          <ProjectDetailView
            project={typedProject}
            isMobile={isMobile}
            navigationState={
              navigationState
                ? {
                    from: navigationState.from,
                    randomizerState: navigationState.randomizerState,
                    dashboardContext: navigationState.dashboardContext,
                  }
                : undefined
            }
            onStatusChange={handleUpdateStatus}
            onUpdateNotes={handleUpdateNotes}
            onArchive={handleArchive}
            onDelete={handleDelete}
            navigateToEdit={navigateToEdit}
            isSubmitting={submitting}
            user={user}
          />
        </ProjectContentErrorBoundary>
        {editDrawerOpen ? (
          <ProjectEditDrawer
            key={`${user?.id ?? 'signed-out'}:${projectId}`}
            projectId={projectId}
            isOpen={editDrawerOpen}
            onOpenChange={setEditDrawerOpen}
          />
        ) : null}
      </div>
    </MainLayout>
  );
};

export default ProjectDetail;
