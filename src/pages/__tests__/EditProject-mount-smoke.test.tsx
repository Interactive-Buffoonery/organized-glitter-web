/**
 * EditProject route-mount smoke test.
 *
 * Mounts /projects/:id/edit with the real ProjectFormSections + EntitySelect
 * + InlineTagManager subtree (NOT mocked) and asserts no render-loop errors.
 *
 * What this file actually catches (honest scope):
 *
 * - A mount-time crash on the populated edit form (e.g. a Radix primitive
 *   breaking because it received a shape it didn't expect, an import that
 *   resolves wrong under a toolchain bump).
 * - An error-boundary fallback rendering instead of the real form.
 * - A regression where ProjectFormSections throws when given populated
 *   company/artist values.
 *
 * What this file does NOT catch on its own:
 *
 * - The specific BUG-1 feedback loop pattern (that's caught by the New
 *   Project mount smoke test in route-mount-smoke.test.tsx, where the
 *   parent's real useState + spread-on-update drives the identity flip).
 *   EditProject holds its state inside a mocked useEditProject facade,
 *   so typing into inputs here doesn't drive real re-renders without
 *   reimplementing half the hook in the mock. That's not worth the
 *   complexity for a second copy of the same coverage.
 *
 * Verified not-theater:
 * - git checkout a6c7ccd^ -- src/components/tags/InlineTagManager.tsx \
 *     src/components/projects/form/EntitySelect.tsx
 * - npx vitest run src/pages/__tests__/EditProject-mount-smoke.test.tsx
 * - These tests still pass on the buggy code because, in production,
 *   /projects/:id/edit also didn't crash under BUG-1; the edit path
 *   had stable formData from the server and never hit the identity-flip
 *   cascade. Coverage here is for the DIFFERENT class of "page crashes
 *   on populated mount" bug, not BUG-1 specifically. If you need BUG-1
 *   coverage for edit, add a real state-holding mock (significant work)
 *   or rely on the NewProject smoke test as the canonical reproducer.
 */

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { fireEvent, renderWithProviders, screen, waitFor } from '../../test-utils';
import {
  installRenderLoopGuard,
  assertNoRenderLoop,
  ERROR_BOUNDARY_FALLBACK_PATTERNS,
} from '../../test-utils/renderLoopGuard';

const guard = installRenderLoopGuard();

// --- Hoisted shared mock state -------------------------------------------

const {
  navigateMock,
  useParamsMock,
  notifyMock,
  handleFormDataChangeMock,
  handleSubmitMock,
  handleArchiveMock,
  handleDeleteMock,
  authState,
  editProjectState,
  baseProject,
  baseFormData,
} = vi.hoisted(() => {
  const baseProject = {
    id: 'project-123',
    userId: 'user-123',
    title: 'Aurora Wolves',
    status: 'progress' as const,
    company: 'Existing Co',
    artist: 'Existing Artist',
    drillShape: 'round' as const,
    kitCategory: 'full' as const,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
  };

  const baseFormData = {
    id: 'project-123',
    userId: 'user-123',
    title: 'Aurora Wolves',
    status: 'progress' as const,
    company: 'Existing Co',
    artist: 'Existing Artist',
    drillShape: 'round' as const,
    kitCategory: 'full' as const,
    tags: [],
  };

  return {
    navigateMock: vi.fn(),
    useParamsMock: vi.fn(() => ({ id: 'project-123' })),
    notifyMock: vi.fn(),
    handleFormDataChangeMock: vi.fn(),
    handleSubmitMock: vi.fn().mockResolvedValue(undefined),
    handleArchiveMock: vi.fn(),
    handleDeleteMock: vi.fn(),
    baseProject,
    baseFormData,
    authState: {
      isAuthenticated: true,
      initialCheckComplete: true,
      isLoading: false,
      user: { id: 'user-123', email: 'test@example.com', username: 'tester' },
    },
    editProjectState: {
      project: baseProject,
      loading: false,
      submitting: false,
      companies: ['Existing Co'],
      artists: ['Existing Artist'],
      formData: baseFormData,
      fieldErrors: {},
      draft: {
        recoverable: null,
        pending: false,
        storageFailed: false,
        discardOnCancel: () => true,
      },
      photoChoicePending: false,
      continueWithoutPhoto: vi.fn(),
      navigationState: { error: null as string | null },
      imageCompatError: null,
      clearNavigationError: vi.fn(),
      clearImageCompatError: vi.fn(),
      handleFormDataChange: vi.fn(),
      handleSubmit: vi.fn().mockResolvedValue(undefined),
      handleArchive: vi.fn(),
      handleDelete: vi.fn(),
      ConfirmationDialog: () => <div data-testid="confirmation-dialog" />,
      error: null as Error | null,
    },
  };
});

// --- Module mocks ---------------------------------------------------------

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

// useEditProject is the facade hook that owns all page data; a single mock
// stands in for its return value. See the file header docstring for why
// this test DOESN'T drive real state updates.
vi.mock('@/hooks/useEditProject', () => ({
  useEditProject: () => ({
    ...editProjectState,
    handleFormDataChange: handleFormDataChangeMock,
    handleSubmit: handleSubmitMock,
    handleArchive: handleArchiveMock,
    handleDelete: handleDeleteMock,
    confirmDiscard: (leave: () => void) => {
      leave();
      return true;
    },
  }),
}));

vi.mock('@/contexts/MetadataContext', () => ({
  useMetadata: () => ({
    companyNames: ['Existing Co'],
    artistNames: ['Existing Artist'],
    companies: [{ id: 'co-1', name: 'Existing Co' }],
    artists: [{ id: 'ar-1', name: 'Existing Artist' }],
    tags: [],
    isLoading: { companies: false, artists: false, tags: false },
    error: null,
  }),
}));

vi.mock('@/hooks/mutations/useCompanyMutations', () => ({
  useCreateCompany: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ id: 'company-1' }),
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/hooks/mutations/useArtistMutations', () => ({
  useCreateArtist: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ id: 'artist-1' }),
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/lib/notifications', () => ({
  notify: notifyMock,
  notifySuccess: notifyMock,
  notifyWarning: notifyMock,
  notifyError: notifyMock,
  notifyInfo: notifyMock,
}));

vi.mock('@/services/pocketbase/tags.service', () => ({
  TagService: {
    getUserTags: vi.fn().mockResolvedValue({ status: 'success', data: [] }),
    addTagToProject: vi.fn().mockResolvedValue({ status: 'success' }),
    removeTagFromProject: vi.fn().mockResolvedValue({ status: 'success' }),
    createTag: vi.fn().mockResolvedValue({ status: 'success', data: {} }),
  },
}));

vi.mock('@/hooks/useImageUpload', () => ({
  useImageUpload: () => ({
    preview: null,
    file: null,
    uploading: false,
    error: null,
    handleImageChange: vi.fn(),
    handleImageRemove: vi.fn(),
  }),
}));

// --- Setup / teardown -----------------------------------------------------

beforeEach(() => {
  guard.reset();
  navigateMock.mockReset();
  notifyMock.mockReset();
  useParamsMock.mockReset().mockReturnValue({ id: 'project-123' });
  editProjectState.project = { ...baseProject };
  editProjectState.loading = false;
  editProjectState.submitting = false;
  editProjectState.formData = { ...baseFormData, tags: [] };
  editProjectState.fieldErrors = {};
  editProjectState.navigationState = { error: null };
  editProjectState.imageCompatError = null;
  editProjectState.error = null;
  handleFormDataChangeMock.mockReset();
  handleFormDataChangeMock.mockImplementation(nextFormData => {
    editProjectState.formData = nextFormData;
  });
  handleSubmitMock.mockReset().mockResolvedValue(undefined);
  handleArchiveMock.mockReset();
  handleDeleteMock.mockReset();
});

afterEach(() => {
  guard.restore();
});

// --- Tests ----------------------------------------------------------------

describe('EditProject route mount (real form subtree)', () => {
  it('mounts a populated edit form without triggering the render loop', async () => {
    const { default: EditProject } = await import('../EditProject');

    renderWithProviders(<EditProject />);

    // The project-name heading proves we got past loading + auth guards.
    expect(await screen.findByRole('heading', { name: 'Aurora Wolves' })).toBeInTheDocument();

    // Populated title input proves formData threaded through the real
    // ProjectFormSections render.
    const titleInput = await screen.findByDisplayValue('Aurora Wolves');
    expect(titleInput).toBeInTheDocument();

    // The tags section is where BUG-1 lived. It must render.
    expect(await screen.findByRole('button', { name: /add tag/i })).toBeInTheDocument();

    // Flush any lingering effects.
    await new Promise(resolve => setTimeout(resolve, 50));

    assertNoRenderLoop(guard);
  });

  it('does not render an error-boundary fallback on mount', async () => {
    const { default: EditProject } = await import('../EditProject');

    renderWithProviders(<EditProject />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Aurora Wolves' })).toBeInTheDocument();
    });

    expect(screen.queryByText(ERROR_BOUNDARY_FALLBACK_PATTERNS.headline)).not.toBeInTheDocument();
    expect(screen.queryByText(ERROR_BOUNDARY_FALLBACK_PATTERNS.bodyText)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: ERROR_BOUNDARY_FALLBACK_PATTERNS.retryButton })
    ).not.toBeInTheDocument();
  });
});

describe('EditProject behavior', () => {
  it('populates the edit form with existing project data', async () => {
    const { default: EditProject } = await import('../EditProject');

    renderWithProviders(<EditProject />);

    expect(await screen.findByRole('textbox', { name: /project title/i })).toHaveValue(
      'Aurora Wolves'
    );
    expect(screen.getByRole('combobox', { name: /company/i })).toHaveTextContent('Existing Co');
    expect(screen.getByRole('combobox', { name: /artist/i })).toHaveTextContent('Existing Artist');
    expect(screen.getByRole('combobox', { name: /status/i })).toHaveTextContent('In Progress');
  });

  it('submits changed project values to the update mutation', async () => {
    const user = userEvent.setup();
    const { default: EditProject } = await import('../EditProject');

    const view = renderWithProviders(<EditProject />);

    const titleInput = await screen.findByRole('textbox', { name: /project title/i });
    await user.click(titleInput);
    fireEvent.change(titleInput, { target: { value: 'Moonlit Fox' } });

    expect(handleFormDataChangeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Moonlit Fox' })
    );

    view.rerender(<EditProject />);
    await user.click(screen.getByRole('button', { name: /update project/i }));

    expect(handleSubmitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'project-123',
        title: 'Moonlit Fox',
        company: 'Existing Co',
        artist: 'Existing Artist',
        status: 'progress',
      })
    );
  });

  it('shows validation errors for required fields', async () => {
    editProjectState.formData = { ...baseFormData, title: '' };
    editProjectState.fieldErrors = { title: 'Project title is required' };
    const { default: EditProject } = await import('../EditProject');

    renderWithProviders(<EditProject />);

    const titleInput = await screen.findByRole('textbox', { name: /project title/i });
    expect(titleInput).toHaveAccessibleDescription('Project title is required');
    expect(screen.getByText('Project title is required')).toBeInTheDocument();
  });

  it('returns to the project detail page when cancel is selected', async () => {
    const user = userEvent.setup();
    const { default: EditProject } = await import('../EditProject');

    renderWithProviders(<EditProject />);

    await user.click(await screen.findByRole('button', { name: /cancel/i }));

    expect(navigateMock).toHaveBeenCalledWith('/projects/project-123');
  });

  it('disables the save action while the update is pending', async () => {
    editProjectState.submitting = true;
    const { default: EditProject } = await import('../EditProject');

    renderWithProviders(<EditProject />);

    expect(await screen.findByRole('button', { name: /saving/i })).toBeDisabled();
  });
});
