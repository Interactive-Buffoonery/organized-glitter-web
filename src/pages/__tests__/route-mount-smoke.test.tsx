/**
 * Route-mount smoke tests.
 *
 * Purpose: catch crashes and infinite render loops that unit tests miss because
 * they mock out the entire form subtree. Specifically designed to have caught
 * BUG-1 (the React 19 upgrade's /projects/new infinite loop in
 * InlineTagManager's bubble-to-parent useEffect): if the real
 * ProjectFormSections + InlineTagManager are mounted and the pattern returns,
 * these tests will fail on "Maximum update depth exceeded" via the
 * console.error spy below.
 *
 * Design rules:
 * - Do NOT mock ProjectFormSections, InlineTagManager, EntitySelect, Accordion,
 *   or any Radix primitive. Those are the render paths that produced BUG-1.
 *   Mocking them defeats the whole purpose.
 * - DO mock the data layer (auth, metadata, mutations, PocketBase services)
 *   and the app chrome (MainLayout) so the tests run in isolation.
 * - Fail the test if console.error contains "Maximum update depth exceeded"
 *   (React logs this through the error boundary; the boundary's fallback
 *   render would otherwise hide the crash).
 */

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '../../test-utils';
import {
  installRenderLoopGuard,
  assertNoRenderLoop,
  ERROR_BOUNDARY_FALLBACK_PATTERNS,
} from '../../test-utils/renderLoopGuard';

const guard = installRenderLoopGuard();

// --- Shared mock state ----------------------------------------------------
// Hoisted so vi.mock factories (which Vitest lifts above module code) can
// reach them.

const {
  navigateMock,
  createProjectMutateAsync,
  createCompanyMutateAsync,
  createArtistMutateAsync,
  notifyMock,
  authState,
  metadataState,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  createProjectMutateAsync: vi.fn(),
  createCompanyMutateAsync: vi.fn(),
  createArtistMutateAsync: vi.fn(),
  notifyMock: vi.fn(),
  authState: {
    user: { id: 'user-123', email: 'test@example.com', username: 'tester' } as {
      id: string;
      email: string;
      username: string;
    } | null,
    isLoading: false,
  },
  metadataState: {
    companyNames: ['Existing Co'] as string[],
    artistNames: ['Existing Artist'] as string[],
    companies: [{ id: 'co-1', name: 'Existing Co' }] as Array<{ id: string; name: string }>,
    artists: [{ id: 'ar-1', name: 'Existing Artist' }] as Array<{ id: string; name: string }>,
    tags: [] as Array<{ id: string; name: string }>,
    isLoading: { companies: false, artists: false, tags: false },
    error: null as Error | null,
  },
}));

// --- Module mocks (loaded before page imports) ----------------------------

vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
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

vi.mock('@/contexts/MetadataContext', () => ({
  useMetadata: () => metadataState,
}));

vi.mock('@/contexts/MetadataContext/MetadataContext', () => ({
  useMetadata: () => metadataState,
}));

vi.mock('@/hooks/useUserTimezone', () => ({
  useUserTimezone: () => 'America/New_York',
}));

vi.mock('@/hooks/mutations/useCreateProject', () => ({
  useCreateProject: () => ({
    mutateAsync: createProjectMutateAsync,
    isPending: false,
  }),
}));

vi.mock('@/hooks/mutations/useCompanyMutations', () => ({
  useCreateCompany: () => ({
    mutateAsync: createCompanyMutateAsync,
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/hooks/mutations/useArtistMutations', () => ({
  useCreateArtist: () => ({
    mutateAsync: createArtistMutateAsync,
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

// TagService is called inside InlineTagManager. At mount time its popover is
// closed so loadAvailableTags isn't invoked, but we still need the module to
// import successfully.
vi.mock('@/services/pocketbase/tags.service', () => ({
  TagService: {
    getUserTags: vi.fn().mockResolvedValue({ status: 'success', data: [] }),
    addTagToProject: vi.fn().mockResolvedValue({ status: 'success' }),
    removeTagFromProject: vi.fn().mockResolvedValue({ status: 'success' }),
    createTag: vi.fn().mockResolvedValue({
      status: 'success',
      data: {
        id: 'tag-new',
        name: 'new',
        slug: 'new',
        color: '#14b8a6',
        userId: 'user-123',
      },
    }),
  },
}));

// useImageUpload is a large hook with refs + file handling. Mount-level tests
// don't exercise the upload path; return a stable object so the form renders.
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
  createProjectMutateAsync.mockReset().mockResolvedValue({ id: 'project-1' });
  createCompanyMutateAsync.mockReset().mockResolvedValue({ id: 'company-1' });
  createArtistMutateAsync.mockReset().mockResolvedValue({ id: 'artist-1' });

  authState.user = { id: 'user-123', email: 'test@example.com', username: 'tester' };
  authState.isLoading = false;

  metadataState.companyNames = ['Existing Co'];
  metadataState.artistNames = ['Existing Artist'];
  metadataState.companies = [{ id: 'co-1', name: 'Existing Co' }];
  metadataState.artists = [{ id: 'ar-1', name: 'Existing Artist' }];
  metadataState.tags = [];
  metadataState.isLoading = { companies: false, artists: false, tags: false };
  metadataState.error = null;
});

afterEach(() => {
  guard.restore();
});

// --- Tests ----------------------------------------------------------------

describe('NewProject route mount (real form subtree)', () => {
  it('mounts the New Project form without triggering the React 19 render loop', async () => {
    const { default: NewProject } = await import('../NewProject');

    renderWithProviders(<NewProject />);

    // Form chrome renders. The heading proves we got past the auth/loading
    // guards and past the form-subtree mount where BUG-1 lived.
    expect(await screen.findByRole('heading', { name: 'New project' })).toBeInTheDocument();

    // The tags section specifically (Accordion + InlineTagManager) is where
    // the loop originated. It must be in the DOM.
    expect(await screen.findByRole('button', { name: /add tag/i })).toBeInTheDocument();

    // Give React one macrotask to flush any lingering effects. A real render
    // loop would have already tripped the "Maximum update depth" guard by
    // this point.
    await new Promise(resolve => setTimeout(resolve, 50));

    assertNoRenderLoop(guard);
  });

  it('does not render any error-boundary fallback on mount', async () => {
    const { default: NewProject } = await import('../NewProject');

    renderWithProviders(<NewProject />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'New project' })).toBeInTheDocument();
    });

    // Common error-boundary fallback strings used in this repo. If any of
    // these show up, a crash was swallowed.
    expect(screen.queryByText(ERROR_BOUNDARY_FALLBACK_PATTERNS.headline)).not.toBeInTheDocument();
    expect(screen.queryByText(ERROR_BOUNDARY_FALLBACK_PATTERNS.bodyText)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: ERROR_BOUNDARY_FALLBACK_PATTERNS.retryButton })
    ).not.toBeInTheDocument();
  });

  it('keeps onTagsChange identity from looping the form subtree', async () => {
    // This test mounts the page, then drives the form through a state change
    // (via the visible Status select) so that the parent's memoized callbacks
    // are guaranteed to have recomputed at least once. That exercises the
    // exact code path where the React-19 feedback loop fires in the buggy
    // version: child InlineTagManager's useEffect sees a new onTagsChange
    // identity on every parent re-render and re-bubbles, forever.

    const { default: NewProject } = await import('../NewProject');

    renderWithProviders(<NewProject />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'New project' })).toBeInTheDocument();
    });

    // Type into the title field to force a parent setFormData -> re-render
    // cycle. Multiple characters ensure we get several recompute passes.
    const titleInput = await screen.findByPlaceholderText('Project title');
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    await user.type(titleInput, 'Rainbow');

    // After a handful of keystroke re-renders, no loop should have started.
    await new Promise(resolve => setTimeout(resolve, 50));

    assertNoRenderLoop(guard);

    // The title reached the input (proves keystrokes weren't eaten by a
    // mid-loop re-render).
    expect(titleInput).toHaveValue('Rainbow');
  });
});
