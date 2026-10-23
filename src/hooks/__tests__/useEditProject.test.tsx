import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ProjectType } from '@/types/project';
import { captureSessionDrafts, clearSessionDrafts } from '@/services/auth/sessionRecovery';

const {
  navigateMock,
  navigateToProjectMock,
  archiveMutateAsync,
  deleteMutateAsync,
  updateMutateAsync,
  notifySuccessMock,
  notifyErrorMock,
  confirmArchiveMock,
  confirmDeleteMock,
  confirmUnsavedChangesMock,
  handleImageChangeMock,
  applyProcessedImageMock,
  imageUploadState,
  cropOutputState,
  navigationWarningState,
  refetchProjectMock,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  navigateToProjectMock: vi.fn(() => ({ success: true })),
  archiveMutateAsync: vi.fn(),
  deleteMutateAsync: vi.fn(),
  updateMutateAsync: vi.fn(),
  notifySuccessMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  confirmArchiveMock: vi.fn(),
  confirmDeleteMock: vi.fn(),
  confirmUnsavedChangesMock: vi.fn(),
  handleImageChangeMock: vi.fn(),
  applyProcessedImageMock: vi.fn(),
  imageUploadState: {
    preview: null as string | null,
    file: null as File | null,
    processedFile: null as File | null,
    uploading: false,
    error: null as string | null,
  },
  cropOutputState: {
    file: null as File | null,
  },
  navigationWarningState: {
    isDirty: false,
  },
  refetchProjectMock: vi.fn(),
}));

const baseProject: ProjectType = {
  id: 'project-123',
  userId: 'abc123def456ghi',
  title: 'Aurora Wolves',
  status: 'progress',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-02T00:00:00.000Z',
};
let delayedProject: ProjectType | undefined = baseProject;

vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    initialCheckComplete: true,
    isLoading: false,
    user: { id: 'abc123def456ghi' },
  }),
}));

vi.mock('@/hooks/useUserTimezone', () => ({
  useUserTimezone: () => 'UTC',
}));

vi.mock('@/hooks/queries/useProjectDetailQuery', () => ({
  useProjectDetailQuery: () => ({
    data: delayedProject,
    isLoading: false,
    error: null,
    refetch: refetchProjectMock,
  }),
}));

vi.mock('@/hooks/useConfirmationDialog', () => ({
  useConfirmationDialog: () => ({
    ConfirmationDialog: () => null,
    confirmDelete: confirmDeleteMock,
    confirmArchive: confirmArchiveMock,
    confirmUnsavedChanges: confirmUnsavedChangesMock,
  }),
}));

vi.mock('@/hooks/useDirtyFormGuard', () => ({
  useDirtyFormGuard: ({ isDirty }: { isDirty: boolean }) => {
    navigationWarningState.isDirty = isDirty;
    return {
      allowLeave: vi.fn(),
      confirmDiscard: vi.fn(),
      markChanged: vi.fn(),
    };
  },
}));

vi.mock('@/hooks/useNavigateToProject', () => ({
  useNavigateToProject: () => navigateToProjectMock,
}));

vi.mock('@/hooks/mutations/useProjectDetailMutations', () => ({
  useArchiveProjectMutation: () => ({
    mutateAsync: archiveMutateAsync,
  }),
  useDeleteProjectMutation: () => ({
    mutateAsync: deleteMutateAsync,
  }),
}));

vi.mock('@/hooks/mutations/useProjectUpdateUnified', () => ({
  useProjectUpdateUnified: () => ({
    mutateAsync: updateMutateAsync,
    status: 'idle',
  }),
}));

vi.mock('@/contexts/MetadataContext', () => ({
  useMetadata: () => ({ companies: [], artists: [] }),
}));

vi.mock('@/lib/notifications', () => ({
  notifySuccess: notifySuccessMock,
  notifyError: notifyErrorMock,
}));

vi.mock('@/hooks/useImageUpload', () => ({
  useImageUpload: () => ({
    ...imageUploadState,
    handleImageChange: handleImageChangeMock,
    handleImageRemove: vi.fn(),
    applyProcessedImage: applyProcessedImageMock,
  }),
}));

vi.mock('@/components/image/ImageCropDialog', () => ({
  ImageCropDialog: ({
    open,
    file,
    onCropComplete,
    onOpenChange,
  }: {
    open: boolean;
    file: File | null;
    onCropComplete: (file: File) => void;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <dialog open aria-label="Crop project image">
        <p>{file?.name}</p>
        <button
          type="button"
          onClick={() => cropOutputState.file && onCropComplete(cropOutputState.file)}
        >
          Use crop
        </button>
        <button type="button" onClick={() => onOpenChange(false)}>
          Skip crop
        </button>
      </dialog>
    ) : null,
}));

vi.mock('@/components/tags/InlineTagManager', () => ({
  InlineTagManager: () => <div data-testid="inline-tag-manager" />,
}));

vi.mock('@/components/projects/form/EntitySelect', () => ({
  EntitySelect: ({ entityLabel }: { entityLabel: string }) => <div>{entityLabel}</div>,
}));

import { useEditProject } from '../useEditProject';
import { ProjectRelationLookupError } from '@/utils/project/projectSaveError';

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return React.createElement(
    QueryClientProvider,
    { client },
    React.createElement(MemoryRouter, null, children)
  );
};

describe('useEditProject', () => {
  beforeEach(() => {
    delayedProject = baseProject;
    clearSessionDrafts();
    localStorage.clear();
    navigateMock.mockReset();
    navigateToProjectMock.mockReset().mockReturnValue({ success: true });
    archiveMutateAsync.mockReset().mockResolvedValue(undefined);
    deleteMutateAsync.mockReset().mockResolvedValue(undefined);
    updateMutateAsync.mockReset().mockResolvedValue({ id: 'project-123' });
    notifySuccessMock.mockReset();
    notifyErrorMock.mockReset();
    confirmArchiveMock.mockReset().mockResolvedValue(true);
    confirmDeleteMock.mockReset().mockResolvedValue(true);
    handleImageChangeMock.mockReset();
    applyProcessedImageMock.mockReset();
    imageUploadState.preview = null;
    imageUploadState.file = null;
    imageUploadState.processedFile = null;
    imageUploadState.uploading = false;
    imageUploadState.error = null;
    cropOutputState.file = null;
    navigationWarningState.isDirty = false;
    refetchProjectMock.mockReset();
  });

  it('does not accept another project revision from a late recovery result', async () => {
    refetchProjectMock.mockResolvedValue({
      isError: false,
      data: { ...baseProject, id: 'project-456', revision: 7 },
    });
    const { result } = renderHook(() => useEditProject('project-123'), { wrapper });
    await waitFor(() => expect(result.current.formData).not.toBeNull());

    await act(async () => {
      expect(await result.current.useLatestRevision()).toBe(false);
    });
    expect(notifyErrorMock).toHaveBeenCalledWith(
      'Could not load latest project',
      'Your edits are still here. Try again.'
    );
  });

  it('marks a restored stale edit as conflicting and keeps its captured revision', async () => {
    delayedProject = { ...baseProject, revision: 2 };
    const first = renderHook(() => useEditProject('project-123'), { wrapper });
    await waitFor(() => expect(first.result.current.formData).not.toBeNull());
    act(() =>
      first.result.current.handleFormDataChange({
        ...first.result.current.formData!,
        title: 'Recovered stale edit',
      })
    );
    captureSessionDrafts('abc123def456ghi', 'expired-stale-project-token');
    first.unmount();
    delayedProject = { ...baseProject, revision: 5 };

    const second = renderHook(() => useEditProject('project-123'), { wrapper });
    await waitFor(() => expect(second.result.current.formData?.title).toBe('Recovered stale edit'));
    expect(second.result.current.conflict).toBe(true);
    if (second.result.current.draft.recoverable) {
      act(() => second.result.current.draft.discard());
    }
    await waitFor(() => expect(second.result.current.draft.pending).toBe(false));
    captureSessionDrafts('abc123def456ghi', 'expired-stale-project-token-again');
    second.unmount();

    const { result } = renderHook(() => useEditProject('project-123'), { wrapper });
    await waitFor(() => expect(result.current.formData?.title).toBe('Recovered stale edit'));
    expect(result.current.conflict).toBe(true);
    if (result.current.draft.recoverable) {
      act(() => result.current.draft.discard());
    }
    await waitFor(() => expect(result.current.draft.pending).toBe(false));

    await act(async () => {
      expect(await result.current.handleSubmit(result.current.formData!)).toBe(true);
    });
    expect(updateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ expectedRevision: 2 })
    );
  });

  it.each(['company', 'artist'] as const)(
    'keeps edits and reports a failed %s lookup without navigating',
    async relation => {
      const lookupError = new ProjectRelationLookupError(relation, {
        type: 'server',
        status: 503,
        retryable: true,
        message: 'Service unavailable',
      });
      updateMutateAsync.mockRejectedValue(lookupError);
      const { result } = renderHook(() => useEditProject('project-123'), { wrapper });
      await waitFor(() => expect(result.current.formData).not.toBeNull());
      act(() =>
        result.current.handleFormDataChange({ ...result.current.formData!, title: 'My edits' })
      );
      await act(async () => {
        expect(await result.current.handleSubmit(result.current.formData!)).toBe(false);
      });
      expect(result.current.formData?.title).toBe('My edits');
      expect(result.current.submitting).toBe(false);
      expect(lookupError).toMatchObject({ reason: 'relation_lookup_failed', relation });
      expect(notifyErrorMock).toHaveBeenCalledOnce();
      expect(navigateToProjectMock).not.toHaveBeenCalled();
    }
  );

  it('does not claim the project was unsaved when an update response is lost', async () => {
    updateMutateAsync.mockRejectedValue({
      type: 'network',
      retryable: true,
      message: 'Response lost after server commit',
    });
    const { result } = renderHook(() => useEditProject('project-123'), { wrapper });
    await waitFor(() => expect(result.current.formData).not.toBeNull());
    await act(async () => {
      expect(await result.current.handleSubmit(result.current.formData!)).toBe(false);
    });
    expect(notifyErrorMock).toHaveBeenCalledExactlyOnceWith(
      'Save not confirmed',
      "We couldn't confirm whether your changes were saved. Check the project before saving again."
    );
    expect(navigateToProjectMock).not.toHaveBeenCalled();
  });
});
