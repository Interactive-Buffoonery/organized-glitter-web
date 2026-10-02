import '@testing-library/jest-dom/vitest';
import React from 'react';
import { vi } from 'vitest';
import {
  renderWithProviders,
  screen,
  waitFor,
  userEvent,
  describe,
  it,
  expect,
  beforeEach,
} from '../../test-utils';
import type { ProjectFormValues, ProjectType } from '../../types/project';

const navigateMock = vi.fn();
const useParamsMock = vi.fn(() => ({ id: 'project-123' }));
const clearNavigationErrorMock = vi.fn();
const handleFormDataChangeMock = vi.fn();
const handleSubmitMock = vi.fn();
const handleArchiveMock = vi.fn();
const handleDeleteMock = vi.fn();
const restoreDraftMock = vi.fn();
const discardDraftMock = vi.fn();
const continueWithoutPhotoMock = vi.fn();
const confirmDiscardMock = vi.fn((leave: () => void) => {
  leave();
  return true;
});

const authState = {
  isAuthenticated: true,
  initialCheckComplete: true,
  isLoading: false,
};

const baseProject: ProjectType = {
  id: 'project-123',
  userId: 'abc123def456ghi',
  title: 'Aurora Wolves',
  status: 'progress',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-02T00:00:00.000Z',
};

const baseFormData: ProjectFormValues = {
  id: 'project-123',
  userId: 'abc123def456ghi',
  title: 'Aurora Wolves',
  status: 'progress',
};

const editProjectState: {
  project: ProjectType | null;
  loading: boolean;
  submitting: boolean;
  companies: Array<{ id: string; name: string }>;
  artists: Array<{ id: string; name: string }>;
  formData: ProjectFormValues;
  fieldErrors: Partial<Record<keyof ProjectFormValues, string>>;
  navigationState: { error: string | null };
  draft: {
    recoverable: { baselineUpdatedAt?: string } | null;
    pending: boolean;
    storageFailed: boolean;
    restore: () => void;
    discard: () => void;
    discardOnCancel: () => boolean;
  };
  photoChoicePending: boolean;
  statusBeforeDateChange: ProjectFormValues['status'] | null;
  setStatusBeforeDateChange: (status: ProjectFormValues['status'] | null) => void;
  continueWithoutPhoto: () => void;
  clearNavigationError: () => void;
  confirmDiscard: (leave: () => void) => boolean;
  handleFormDataChange: (data: ProjectFormValues) => void;
  handleSubmit: (data: ProjectFormValues) => Promise<void>;
  handleArchive: () => void;
  handleDelete: () => void;
  ConfirmationDialog: () => React.JSX.Element;
  error: Error | null;
} = {
  project: baseProject,
  loading: false,
  submitting: false,
  companies: [{ id: 'company-1', name: 'Diamond Dotz' }],
  artists: [{ id: 'artist-1', name: 'Jane Doe' }],
  formData: baseFormData,
  fieldErrors: {},
  navigationState: { error: null as string | null },
  draft: {
    recoverable: null,
    pending: false,
    storageFailed: false,
    restore: restoreDraftMock,
    discard: discardDraftMock,
    discardOnCancel: () => true,
  },
  photoChoicePending: false,
  statusBeforeDateChange: null,
  setStatusBeforeDateChange: vi.fn(),
  continueWithoutPhoto: continueWithoutPhotoMock,
  clearNavigationError: clearNavigationErrorMock,
  confirmDiscard: confirmDiscardMock,
  handleFormDataChange: handleFormDataChangeMock,
  handleSubmit: handleSubmitMock,
  handleArchive: handleArchiveMock,
  handleDelete: handleDeleteMock,
  ConfirmationDialog: () => <div data-testid="confirmation-dialog" />,
  error: null as Error | null,
};

vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => useParamsMock(),
  };
});

vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="main-layout">{children}</div>
  ),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

vi.mock('@/hooks/useEditProject', () => ({
  useEditProject: () => editProjectState,
}));

vi.mock('@/components/projects/EditProjectNotFound', () => ({
  EditProjectNotFound: () => <div data-testid="edit-project-not-found">not found</div>,
}));

vi.mock('@/components/projects/EditProjectSkeleton', () => ({
  default: () => <div data-testid="edit-project-skeleton">loading</div>,
}));

vi.mock('@/components/projects/ProjectFormSections', () => ({
  default: ({
    formData,
    onChange,
    fieldErrors,
  }: {
    formData: ProjectFormValues;
    onChange: (data: ProjectFormValues) => void;
    fieldErrors?: Partial<Record<keyof ProjectFormValues, string>>;
  }) => (
    <div data-testid="edit-project-form-sections">
      <p>Section title: {formData.title}</p>
      {fieldErrors?.sourceUrl && <p>{fieldErrors.sourceUrl}</p>}
      <button
        type="button"
        onClick={() =>
          onChange({
            ...formData,
            title: 'Updated Aurora Wolves',
            totalDiamonds: '20000',
            colorCount: '48',
          })
        }
      >
        Edit sections
      </button>
    </div>
  ),
}));

import EditProject from '../EditProject';

describe('EditProject page', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    useParamsMock.mockReset().mockReturnValue({ id: 'project-123' });
    clearNavigationErrorMock.mockReset();
    handleFormDataChangeMock.mockReset();
    handleSubmitMock.mockReset().mockResolvedValue(undefined);
    handleArchiveMock.mockReset();
    handleDeleteMock.mockReset();
    restoreDraftMock.mockReset();
    discardDraftMock.mockReset();
    continueWithoutPhotoMock.mockReset();
    confirmDiscardMock.mockClear();

    authState.isAuthenticated = true;
    authState.initialCheckComplete = true;
    authState.isLoading = false;

    editProjectState.project = { ...baseProject };
    editProjectState.loading = false;
    editProjectState.submitting = false;
    editProjectState.companies = [{ id: 'company-1', name: 'Diamond Dotz' }];
    editProjectState.artists = [{ id: 'artist-1', name: 'Jane Doe' }];
    editProjectState.formData = { ...baseFormData };
    editProjectState.fieldErrors = {};
    editProjectState.navigationState = { error: null };
    editProjectState.draft.recoverable = null;
    editProjectState.draft.pending = false;
    editProjectState.draft.storageFailed = false;
    editProjectState.photoChoicePending = false;
    editProjectState.error = null;
  });

  it('passes inline field errors into the edit form sections', () => {
    editProjectState.fieldErrors = {
      sourceUrl: 'Source URL must be a valid URL if provided',
    };

    renderWithProviders(<EditProject />);

    expect(screen.getByText('Source URL must be a valid URL if provided')).toBeInTheDocument();
  });

  it('renders the single-scroll edit flow without tabs', () => {
    renderWithProviders(<EditProject />);

    expect(screen.getByText('Editing')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Aurora Wolves' })).toBeInTheDocument();
    expect(screen.getByTestId('edit-project-form-sections')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(document.title).toBe('Edit Aurora Wolves | Organized Glitter');
  });

  it('wires the page controls into the live edit handlers', async () => {
    const user = userEvent.setup();

    renderWithProviders(<EditProject />);

    await user.click(screen.getByRole('button', { name: 'Edit sections' }));
    expect(handleFormDataChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Updated Aurora Wolves',
        totalDiamonds: '20000',
        colorCount: '48',
      })
    );

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: /archive/i }));
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: /delete project/i }));
    await user.click(screen.getByRole('button', { name: 'Update project' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => {
      expect(handleArchiveMock).toHaveBeenCalled();
      expect(handleDeleteMock).toHaveBeenCalled();
      expect(handleSubmitMock).toHaveBeenCalledWith(editProjectState.formData);
      expect(navigateMock).toHaveBeenCalledWith('/projects/project-123');
    });
  });

  it('runs the discard guard once before leaving the edit page', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EditProject />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(confirmDiscardMock).toHaveBeenCalledOnce();
    expect(navigateMock).toHaveBeenCalledOnce();
    expect(navigateMock).toHaveBeenCalledWith('/projects/project-123');
  });

  it('blocks saving during draft recovery and requires a photo choice', async () => {
    const user = userEvent.setup();
    editProjectState.draft.recoverable = { baselineUpdatedAt: baseProject.updatedAt };
    editProjectState.draft.pending = true;
    const { rerender } = renderWithProviders(<EditProject />);

    expect(screen.getByRole('button', { name: 'Update project' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Restore draft' }));
    expect(restoreDraftMock).toHaveBeenCalledOnce();

    editProjectState.draft.recoverable = null;
    editProjectState.draft.pending = false;
    editProjectState.photoChoicePending = true;
    rerender(<EditProject />);
    expect(screen.getByRole('button', { name: 'Update project' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Continue without new photo' }));
    expect(continueWithoutPhotoMock).toHaveBeenCalledOnce();
  });

  it('shows loading and not-found states from the live page entrypoint', () => {
    editProjectState.loading = true;
    const { rerender } = renderWithProviders(<EditProject />);
    expect(screen.getByTestId('edit-project-skeleton')).toBeInTheDocument();

    editProjectState.loading = false;
    editProjectState.project = null;
    rerender(<EditProject />);

    expect(screen.getByTestId('edit-project-not-found')).toBeInTheDocument();
    expect(document.title).toBe('Project not found | Organized Glitter');
  });
});
