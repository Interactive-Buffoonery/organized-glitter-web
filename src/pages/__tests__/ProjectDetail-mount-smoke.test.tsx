/**
 * ProjectDetail route-mount smoke test.
 *
 * Mounts /projects/:id with the real ProjectDetailView subtree and asserts
 * no render-loop errors. ProjectDetailView is one of the denser Radix
 * surfaces in the app: inline Status select, notes accordion, progress
 * timeline, image gallery, delete alert-dialog. Any of these primitives
 * mis-composing a ref under a future React/Radix bump would show here.
 *
 * Scope:
 * - Catches mount-time crashes and error-boundary fallbacks on the detail
 *   page.
 * - Does NOT exercise the status-select change path (that's a full user
 *   flow, not a smoke test).
 */

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, waitFor } from '../../test-utils';
import {
  installRenderLoopGuard,
  assertNoRenderLoop,
  ERROR_BOUNDARY_FALLBACK_PATTERNS,
} from '../../test-utils/renderLoopGuard';

const guard = installRenderLoopGuard();

const {
  navigateMock,
  useParamsMock,
  useLocationMock,
  notifyMock,
  captureMock,
  authState,
  projectData,
  baseProjectData,
  progressNotesState,
  editProjectState,
} = vi.hoisted(() => {
  const baseProjectData = {
    id: 'project-123',
    userId: 'user-123',
    title: 'Aurora Wolves',
    status: 'progress' as const,
    company: 'Existing Co',
    artist: 'Existing Artist',
    drillShape: 'round' as const,
    kitCategory: 'full' as const,
    width: 30,
    height: 40,
    totalDiamonds: 25000,
    sourceUrl: 'https://example.com',
    generalNotes: 'Test notes',
    tagNames: [],
    datePurchased: undefined,
    dateReceived: undefined,
    dateStarted: undefined,
    dateCompleted: undefined,
    imageUrl: undefined as string | undefined,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
  };

  return {
    navigateMock: vi.fn(),
    useParamsMock: vi.fn(() => ({ id: 'project-123' })),
    useLocationMock: vi.fn(() => ({ pathname: '/projects/project-123', state: null })),
    notifyMock: vi.fn(),
    captureMock: vi.fn(),
    authState: {
      user: { id: 'user-123', email: 'test@example.com', username: 'tester' },
      isAuthenticated: true,
      initialCheckComplete: true,
      isLoading: false,
    },
    baseProjectData,
    projectData: { ...baseProjectData },
    progressNotesState: {
      data: [] as Array<{
        id: string;
        projectId: string;
        date: string;
        content: string;
        imageUrl?: string;
        createdAt: string;
        updatedAt: string;
      }>,
    },
    editProjectState: {
      project: baseProjectData,
      loading: false,
      submitting: false,
      companies: ['Existing Co'],
      artists: ['Existing Artist'],
      formData: {
        ...baseProjectData,
        tags: [],
      },
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
      handleSubmit: vi.fn().mockResolvedValue(true),
      handleArchive: vi.fn(),
      handleDelete: vi.fn(),
      ConfirmationDialog: () => <div data-testid="edit-project-confirmation-dialog" />,
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
    useLocation: () => useLocationMock(),
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

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
  useMobileDevice: () => ({
    isMobile: false,
    isPhone: false,
    isTouchDevice: false,
    isMobileAndTouch: false,
    isTablet: false,
    isLandscape: false,
    screenSize: 'lg',
    width: 1024,
    height: 768,
  }),
}));

vi.mock('@/hooks/queries/useProjectDetailQuery', () => ({
  useProjectDetailQuery: () => ({
    data: projectData,
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

vi.mock('@/hooks/useNavigateToProject', () => ({
  NavigationContext: {},
}));

vi.mock('@/hooks/mutations/useUpdateProjectStatus', () => ({
  useUpdateProjectStatus: () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    mutate: vi.fn(),
    isPending: false,
  }),
}));

// Stub every mutation hook exported by this module with a no-op shape.
vi.mock('@/hooks/mutations/useProjectDetailMutations', () => {
  const mkMutation = () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    data: undefined,
    reset: vi.fn(),
  });
  return {
    useUpdateProjectDatesSectionMutation: mkMutation,
    useUpdateProjectNotesSectionMutation: mkMutation,
    useAddProgressNoteMutation: mkMutation,
    useUpdateProgressNoteMutation: mkMutation,
    useDeleteProgressNoteMutation: mkMutation,
    useDeleteProgressNoteImageMutation: mkMutation,
    useArchiveProjectMutation: mkMutation,
    useDeleteProjectMutation: mkMutation,
  };
});

vi.mock('@/hooks/queries/useProgressNotes', () => ({
  useProgressNotesQuery: () => ({
    data: progressNotesState.data,
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

vi.mock('@/hooks/useEditProject', () => ({
  useEditProject: () => editProjectState,
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
    processedFile: null,
    uploading: false,
    error: null,
    handleImageChange: vi.fn(),
    handleImageRemove: vi.fn(),
    applyProcessedImage: vi.fn(),
  }),
}));

vi.mock('@/lib/notifications', () => ({
  notify: notifyMock,
  notifySuccess: notifyMock,
  notifyWarning: notifyMock,
  notifyError: notifyMock,
  notifyInfo: notifyMock,
}));

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture: captureMock }),
}));

vi.mock('@/services/analytics-events', () => ({
  AnalyticsEvent: { PROJECT_STATUS_CHANGED: 'project_status_changed' },
}));

// --- Setup / teardown -----------------------------------------------------

beforeEach(() => {
  guard.reset();
  navigateMock.mockReset();
  useParamsMock.mockReset().mockReturnValue({ id: 'project-123' });
  useLocationMock.mockReset().mockReturnValue({
    pathname: '/projects/project-123',
    state: null,
  });
  notifyMock.mockReset();
  captureMock.mockReset();
  Object.assign(projectData, { ...baseProjectData });
  progressNotesState.data = [];
  editProjectState.project = { ...baseProjectData };
  editProjectState.formData = { ...baseProjectData, tags: [] };
  editProjectState.submitting = false;
  editProjectState.fieldErrors = {};
});

afterEach(() => {
  guard.restore();
});

// --- Tests ----------------------------------------------------------------

describe('ProjectDetail route mount (real detail view)', () => {
  it('mounts with project data and renders the real Radix primitives', async () => {
    const { default: ProjectDetail } = await import('../ProjectDetail');

    renderWithProviders(<ProjectDetail />);

    // Project title should render after the data resolves. This proves we
    // got past the loading/auth guards and past the ProjectDetailView mount.
    expect(await screen.findByText('Aurora Wolves')).toBeInTheDocument();
    expect(document.title).toBe('Aurora Wolves | Organized Glitter');

    await new Promise(resolve => setTimeout(resolve, 50));

    assertNoRenderLoop(guard);
  });

  it('does not render an error-boundary fallback on mount', async () => {
    const { default: ProjectDetail } = await import('../ProjectDetail');

    renderWithProviders(<ProjectDetail />);

    await waitFor(() => {
      expect(screen.getByText('Aurora Wolves')).toBeInTheDocument();
    });

    expect(screen.queryByText(ERROR_BOUNDARY_FALLBACK_PATTERNS.headline)).not.toBeInTheDocument();
    expect(screen.queryByText(ERROR_BOUNDARY_FALLBACK_PATTERNS.bodyText)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: ERROR_BOUNDARY_FALLBACK_PATTERNS.retryButton })
    ).not.toBeInTheDocument();
  });
});

describe('ProjectDetail behavior', () => {
  it('renders project title, status, and description from project data', async () => {
    const { default: ProjectDetail } = await import('../ProjectDetail');

    renderWithProviders(<ProjectDetail />);

    expect(await screen.findByRole('heading', { name: 'Aurora Wolves' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /status/i })).toHaveTextContent('In Progress');
    expect(screen.getByText('Test notes')).toBeInTheDocument();
  });

  it('renders progress notes when the project has notes', async () => {
    progressNotesState.data = [
      {
        id: 'note-1',
        projectId: 'project-123',
        date: '2026-02-14',
        content: 'Finished the moon section.',
        createdAt: '2026-02-14T12:00:00.000Z',
        updatedAt: '2026-02-14T12:00:00.000Z',
      },
    ];
    const { default: ProjectDetail } = await import('../ProjectDetail');

    renderWithProviders(<ProjectDetail />);

    expect(await screen.findByText('Finished the moon section.')).toBeInTheDocument();
    expect(screen.getByText('February')).toBeInTheDocument();
  });

  it('opens the edit surface from the edit button', async () => {
    const user = userEvent.setup();
    const { default: ProjectDetail } = await import('../ProjectDetail');

    renderWithProviders(<ProjectDetail />);

    await user.click(await screen.findByRole('button', { name: /edit project/i }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /edit project/i })).toBeInTheDocument();
  });

  it('opens a confirmation dialog before deleting the project', async () => {
    const user = userEvent.setup();
    const { default: ProjectDetail } = await import('../ProjectDetail');

    renderWithProviders(<ProjectDetail />);

    await user.click(await screen.findByRole('button', { name: /more project actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete project/i }));

    expect(await screen.findByRole('alertdialog')).toHaveAccessibleDescription(
      /permanently delete your project/i
    );
  });

  it('renders the image gallery when the project has an image', async () => {
    projectData.imageUrl = 'https://images.example.test/aurora-wolves.jpg';
    const { default: ProjectDetail } = await import('../ProjectDetail');

    renderWithProviders(<ProjectDetail />);

    expect(
      await screen.findByRole('button', { name: /view larger image: aurora wolves/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Aurora Wolves' })).toBeInTheDocument();
  });
});
