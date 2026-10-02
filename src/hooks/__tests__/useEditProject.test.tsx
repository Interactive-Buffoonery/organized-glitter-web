import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ProjectFormValues, ProjectType } from '@/types/project';
import { getDraftGeneration, readFormDraft } from '@/hooks/drafts/formDraftStorage';
import { isProjectDraftValues } from '@/hooks/drafts/formDraftAdapters';
import { POCKETBASE_URL } from '@/lib/pocketbaseConfig';
import {
  captureSessionDrafts,
  clearSessionDrafts,
  peekSessionDraft,
  registerSessionDraft,
} from '@/services/auth/sessionRecovery';
import { sessionDraftKeys } from '@/services/auth/sessionDraftKeys';

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
import ProjectFormSections from '@/components/projects/ProjectFormSections';

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

const ProjectEditFormHarness = () => {
  const edit = useEditProject('project-123');
  if (!edit.formData) return null;

  return (
    <>
      <ProjectFormSections
        formData={edit.formData}
        companies={edit.companies}
        artists={edit.artists}
        isSubmitting={edit.submitting}
        onChange={edit.handleFormDataChange}
      />
      <button type="button" onClick={() => edit.handleSubmit(edit.formData!)}>
        Save project
      </button>
    </>
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

  it('keeps a recovered edit when the project query resolves later', async () => {
    delayedProject = undefined;
    const restored = { ...baseProject, title: 'Recovered edit' } as ProjectFormValues;
    const unregister = registerSessionDraft(
      sessionDraftKeys.projectEdit('project-123', 'page'),
      () => ({ formData: restored, statusBeforeDateChange: 'progress', missingPhoto: true })
    );
    captureSessionDrafts('abc123def456ghi', 'expired-project-token');
    unregister();
    expect(
      peekSessionDraft<{ formData: ProjectFormValues }>(
        sessionDraftKeys.projectEdit('project-123', 'page'),
        'abc123def456ghi'
      )?.formData.title
    ).toBe('Recovered edit');

    const view = renderHook(() => useEditProject('project-123'), { wrapper });
    expect(view.result.current.formData).toBeNull();

    delayedProject = baseProject;
    view.rerender();

    await waitFor(() => expect(view.result.current.formData?.title).toBe('Recovered edit'));
    expect(view.result.current.statusBeforeDateChange).toBe('progress');
    expect(view.result.current.photoChoicePending).toBe(true);
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

  it('includes tag IDs only when the project edit changed its opening selection', async () => {
    const { result } = renderHook(() => useEditProject('project-123'), { wrapper });
    await waitFor(() => expect(result.current.formData).not.toBeNull());

    await act(async () => {
      await result.current.handleSubmit(result.current.formData!);
    });
    expect(updateMutateAsync.mock.lastCall?.[0].tagIds).toBeUndefined();

    const addedTag = {
      id: 'abc123def456ghi',
      userId: 'abc123def456ghi',
      name: 'Cozy',
      slug: 'cozy',
      color: '#14b8a6',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    act(() =>
      result.current.handleFormDataChange({
        ...result.current.formData!,
        tags: [addedTag],
      })
    );
    await act(async () => {
      await result.current.handleSubmit(result.current.formData!);
    });
    expect(updateMutateAsync.mock.lastCall?.[0].tagIds).toEqual([addedTag.id]);
  });

  it('asks the user to sign in again after an authentication failure', async () => {
    updateMutateAsync.mockRejectedValue({
      type: 'auth',
      retryable: false,
      message: 'User not authenticated',
    });
    const { result } = renderHook(() => useEditProject('project-123'), { wrapper });
    await waitFor(() => expect(result.current.formData).not.toBeNull());
    await act(async () => {
      expect(await result.current.handleSubmit(result.current.formData!)).toBe(false);
    });
    expect(notifyErrorMock).toHaveBeenCalledExactlyOnceWith(
      'Project not saved',
      'Please sign in again to save your changes.'
    );
    expect(navigateToProjectMock).not.toHaveBeenCalled();
  });

  it('navigates to /dashboard with replace after a successful archive', async () => {
    const { result } = renderHook(() => useEditProject('project-123'), { wrapper });

    await waitFor(() => {
      expect(result.current.project).toBeDefined();
    });

    await act(async () => {
      await result.current.handleArchive();
    });

    expect(archiveMutateAsync).toHaveBeenCalledWith({ projectId: 'project-123' });
    expect(notifySuccessMock).toHaveBeenCalledWith(
      'Project archived',
      'Project archived successfully'
    );
    expect(navigateMock).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  it.each(['archive', 'delete'] as const)(
    'removes an unfinished project draft after successful %s',
    async action => {
      const { result } = renderHook(() => useEditProject('project-123'), { wrapper });
      await waitFor(() => expect(result.current.formData).not.toBeNull());
      act(() =>
        result.current.handleFormDataChange({ ...result.current.formData!, title: 'Unsaved edit' })
      );
      const identity = {
        backendUrl: POCKETBASE_URL,
        accountId: 'abc123def456ghi',
        kind: 'project-edit' as const,
        recordId: 'project-123',
      };
      const generation = getDraftGeneration(identity)!;
      await waitFor(
        () =>
          expect(readFormDraft(identity, generation, isProjectDraftValues).draft).not.toBeNull(),
        { timeout: 2000 }
      );

      await act(async () => {
        if (action === 'archive') await result.current.handleArchive();
        else await result.current.handleDelete();
      });

      expect(readFormDraft(identity, generation, isProjectDraftValues).draft).toBeNull();
    }
  );

  it('does not navigate or notify success when archive is cancelled', async () => {
    confirmArchiveMock.mockResolvedValue(false);

    const { result } = renderHook(() => useEditProject('project-123'), { wrapper });

    await waitFor(() => {
      expect(result.current.project).toBeDefined();
    });

    await act(async () => {
      await result.current.handleArchive();
    });

    expect(archiveMutateAsync).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(notifySuccessMock).not.toHaveBeenCalled();
  });

  it('surfaces archive failures via notifyError and does not navigate', async () => {
    archiveMutateAsync.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useEditProject('project-123'), { wrapper });

    await waitFor(() => {
      expect(result.current.project).toBeDefined();
    });

    await act(async () => {
      await result.current.handleArchive();
    });

    expect(notifyErrorMock).toHaveBeenCalledWith('Archive failed', 'Failed to archive project');
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('blocks update submission and exposes inline field errors for invalid form data', async () => {
    const { result } = renderHook(() => useEditProject('project-123'), { wrapper });

    await waitFor(() => {
      expect(result.current.formData).toBeDefined();
    });

    await act(async () => {
      await result.current.handleSubmit({
        ...result.current.formData!,
        sourceUrl: 'not-a-url',
      });
    });

    expect(updateMutateAsync).not.toHaveBeenCalled();
    expect(result.current.fieldErrors.sourceUrl).toBe('Source URL must be a valid URL if provided');
  });

  it('clears a field error when that field changes', async () => {
    const { result } = renderHook(() => useEditProject('project-123'), { wrapper });

    await waitFor(() => {
      expect(result.current.formData).toBeDefined();
    });

    act(() => {
      result.current.handleFormDataChange({
        ...result.current.formData!,
        sourceUrl: 'not-a-url',
      });
    });

    await waitFor(() => {
      expect(result.current.formData?.sourceUrl).toBe('not-a-url');
    });

    await act(async () => {
      await result.current.handleSubmit(result.current.formData!);
    });

    act(() => {
      result.current.handleFormDataChange({
        ...result.current.formData!,
        sourceUrl: '',
      });
    });

    await waitFor(() => {
      expect(result.current.fieldErrors.sourceUrl).toBeUndefined();
    });
  });

  it.each<[keyof ProjectFormValues, ProjectFormValues[keyof ProjectFormValues]]>([
    ['drillType', 'resin'],
    ['canvasType', 'poured glue'],
    ['imageUrl', 'https://example.com/replacement.jpg'],
    ['tagNames', ['Animals']],
    ['tagIds', ['tag-123']],
  ])('keeps a %s change and marks the form dirty', async (field, value) => {
    const { result } = renderHook(() => useEditProject('project-123'), { wrapper });

    await waitFor(() => {
      expect(result.current.formData).toBeDefined();
    });

    act(() => {
      result.current.handleFormDataChange({
        ...result.current.formData!,
        [field]: value,
      });
    });

    await waitFor(() => {
      expect(result.current.formData?.[field]).toEqual(value);
      expect(navigationWarningState.isDirty).toBe(true);
    });
  });

  it('submits crop output selected through the full project edit form', async () => {
    const selectedFile = new File(['selected'], 'selected.jpg', { type: 'image/jpeg' });
    const croppedFile = new File(['cropped'], 'cropped.jpg', { type: 'image/jpeg' });
    handleImageChangeMock.mockResolvedValue(selectedFile);
    cropOutputState.file = croppedFile;

    const { container } = render(<ProjectEditFormHarness />, { wrapper });
    await waitFor(() => {
      expect(container.querySelector('input[type="file"]')).toBeInstanceOf(HTMLInputElement);
    });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [selectedFile] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Use crop' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save project' }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());

    expect(JSON.stringify(selectedFile)).toBe(JSON.stringify(croppedFile));
    expect(updateMutateAsync.mock.calls[0]?.[0].imageFile).toBe(croppedFile);
  });

  it('submits the latest of two consecutive full-form file selections', async () => {
    const firstFile = new File(['first'], 'first.jpg', { type: 'image/jpeg' });
    const secondFile = new File(['second'], 'second.jpg', { type: 'image/jpeg' });
    handleImageChangeMock.mockResolvedValueOnce(firstFile).mockResolvedValueOnce(secondFile);

    const { container } = render(<ProjectEditFormHarness />, { wrapper });
    await waitFor(() => {
      expect(container.querySelector('input[type="file"]')).toBeInstanceOf(HTMLInputElement);
    });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [firstFile] } });
    await screen.findByText('first.jpg');
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [secondFile] },
    });
    await screen.findByText('second.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'Save project' }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());

    expect(JSON.stringify(firstFile)).toBe(JSON.stringify(secondFile));
    expect(updateMutateAsync.mock.calls[0]?.[0].imageFile).toBe(secondFile);
  });

  it('navigates to the project detail after a successful save by default', async () => {
    const { result } = renderHook(() => useEditProject('project-123'), { wrapper });

    await waitFor(() => {
      expect(result.current.formData).toBeDefined();
    });

    let submitResult: boolean | undefined;
    await act(async () => {
      submitResult = await result.current.handleSubmit(result.current.formData!);
    });

    expect(updateMutateAsync).toHaveBeenCalled();
    expect(navigateToProjectMock).toHaveBeenCalledWith('project-123');
    expect(submitResult).toBe(true);
  });

  it('skips navigation and resolves true when navigateOnSubmit is false', async () => {
    const { result } = renderHook(
      () => useEditProject('project-123', { navigateOnSubmit: false }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.formData).toBeDefined();
    });

    let submitResult: boolean | undefined;
    await act(async () => {
      submitResult = await result.current.handleSubmit(result.current.formData!);
    });

    expect(updateMutateAsync).toHaveBeenCalled();
    expect(navigateToProjectMock).not.toHaveBeenCalled();
    expect(submitResult).toBe(true);
  });

  it('resolves false when the save mutation fails', async () => {
    updateMutateAsync.mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(
      () => useEditProject('project-123', { navigateOnSubmit: false }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.formData).toBeDefined();
    });

    let submitResult: boolean | undefined;
    await act(async () => {
      submitResult = await result.current.handleSubmit(result.current.formData!);
    });

    expect(navigateToProjectMock).not.toHaveBeenCalled();
    expect(submitResult).toBe(false);
  });
});
