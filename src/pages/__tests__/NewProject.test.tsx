import '@testing-library/jest-dom/vitest';
import React from 'react';
import { within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { QueryClient } from '@tanstack/react-query';
import { vi } from 'vitest';
import {
  renderWithProviders,
  screen,
  waitFor,
  act,
  userEvent,
  describe,
  it,
  expect,
  beforeEach,
} from '../../test-utils';
import type { ProjectFormValues } from '../../types/project';
import { ProjectRelationLookupError } from '@/utils/project/projectSaveError';
import {
  captureSessionDrafts,
  clearSessionDrafts,
  recordCompletedSessionCreate,
  peekCompletedSessionDestinations,
  registerSessionDraft,
  peekSessionDraft,
  SessionChangedError,
} from '@/services/auth/sessionRecovery';
import { getDraftGeneration, readFormDraft, writeFormDraft } from '@/hooks/drafts/formDraftStorage';
import { isProjectDraftValues } from '@/hooks/drafts/formDraftAdapters';
import { POCKETBASE_URL } from '@/lib/pocketbaseConfig';
import TestWrapper from '@/test-utils/TestWrapper';

const navigateMock = vi.fn();
const {
  toastMock,
  deleteCompany,
  deleteArtist,
  findCompany,
  findArtist,
  useCreateCompanyMock,
  useCreateArtistMock,
} = vi.hoisted(() => ({
  toastMock: vi.fn(),
  deleteCompany: vi.fn(),
  deleteArtist: vi.fn(),
  findCompany: vi.fn(),
  findArtist: vi.fn(),
  useCreateCompanyMock: vi.fn(),
  useCreateArtistMock: vi.fn(),
}));
const createProjectMutateAsync = vi.fn();
const createCompanyMutateAsync = vi.fn();
const createArtistMutateAsync = vi.fn();

const authState: {
  user: { id: string; email: string; username: string } | null;
  isLoading: boolean;
  initialCheckComplete: boolean;
} = {
  user: { id: 'abc123def456ghi', email: 'test@example.com', username: 'tester' },
  isLoading: false,
  initialCheckComplete: true,
};

const metadataState = {
  companyNames: ['Existing Co'],
  artistNames: ['Existing Artist'],
  isLoading: {
    companies: false,
    artists: false,
    tags: false,
  },
};

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

vi.mock('@/hooks/useUserTimezone', () => ({
  useUserTimezone: () => 'America/New_York',
}));

vi.mock('@/hooks/mutations/useCreateProject', () => ({
  useCreateProject: () => ({
    mutateAsync: createProjectMutateAsync,
  }),
}));

vi.mock('@/hooks/mutations/useCompanyMutations', () => ({
  useCreateCompany: useCreateCompanyMock,
}));

vi.mock('@/hooks/mutations/useArtistMutations', () => ({
  useCreateArtist: useCreateArtistMock,
}));

vi.mock('@/services/pocketbase/companies.service', () => ({
  CompaniesService: { delete: deleteCompany, findByName: findCompany },
}));

vi.mock('@/services/pocketbase/artists.service', () => ({
  ArtistsService: { delete: deleteArtist, findByName: findArtist },
}));

vi.mock('@/lib/notifications', () => ({
  notify: toastMock,
  notifySuccess: toastMock,
  notifyWarning: toastMock,
  notifyError: toastMock,
  notifyInfo: toastMock,
}));

vi.mock('@/components/projects/ProjectFormSections', () => ({
  default: ({
    formData,
    onChange,
    fieldErrors,
    statusBeforeDateChange,
    onStatusBeforeDateChange,
    onDraftCompany,
    onDraftArtist,
  }: {
    formData: ProjectFormValues;
    onChange: (data: ProjectFormValues) => void;
    fieldErrors?: Partial<Record<keyof ProjectFormValues, string>>;
    statusBeforeDateChange?: ProjectFormValues['status'] | null;
    onStatusBeforeDateChange?: (status: ProjectFormValues['status'] | null) => void;
    onDraftCompany?: (data: { name: string; website_url?: string }) => void;
    onDraftArtist?: (data: { name: string }) => void;
  }) => (
    <div data-testid="project-form-sections">
      <p>Section title: {formData.title || 'empty'}</p>
      <p>Prior status: {statusBeforeDateChange ?? 'none'}</p>
      {fieldErrors?.sourceUrl && <p>{fieldErrors.sourceUrl}</p>}
      <button
        type="button"
        onClick={() => {
          onStatusBeforeDateChange?.('wishlist');
          onChange({ ...formData, status: 'completed', dateCompleted: '2026-09-20' });
        }}
      >
        Set completion date
      </button>
      <button
        type="button"
        onClick={() => {
          onDraftCompany?.({ name: 'New Co', website_url: 'https://new.example' });
          onDraftArtist?.({ name: 'New Artist' });
          onChange({
            ...formData,
            title: 'Galaxy Garden',
            company: 'New Co',
            artist: 'New Artist',
            totalDiamonds: '12345',
            colorCount: '48',
            sourceUrl: '',
            tags: [
              {
                id: 'abc123def456ghj',
                userId: 'abc123def456ghi',
                name: 'Sparkly',
                slug: 'sparkly',
                color: '#fff',
                createdAt: '2025-01-01T00:00:00.000Z',
                updatedAt: '2025-01-01T00:00:00.000Z',
              },
            ],
          });
        }}
      >
        Fill sections
      </button>
      <button
        type="button"
        onClick={() =>
          onChange({
            ...formData,
            title: 'Galaxy Garden',
            sourceUrl: 'not-a-url',
          })
        }
      >
        Fill invalid source
      </button>
    </div>
  ),
}));

import NewProject from '../NewProject';

describe('NewProject page', () => {
  beforeEach(() => {
    clearSessionDrafts();
    localStorage.clear();
    navigateMock.mockReset();
    toastMock.mockReset();
    createProjectMutateAsync.mockReset().mockResolvedValue({ id: 'project-123' });
    createCompanyMutateAsync.mockReset().mockResolvedValue({ id: 'company-123' });
    createArtistMutateAsync.mockReset().mockResolvedValue({ id: 'artist-123' });
    useCreateCompanyMock.mockReset().mockReturnValue({ mutateAsync: createCompanyMutateAsync });
    useCreateArtistMock.mockReset().mockReturnValue({ mutateAsync: createArtistMutateAsync });
    deleteCompany.mockReset().mockResolvedValue(undefined);
    deleteArtist.mockReset().mockResolvedValue(undefined);
    findCompany.mockReset().mockResolvedValue(null);
    findArtist.mockReset().mockResolvedValue(null);
    authState.user = { id: 'abc123def456ghi', email: 'test@example.com', username: 'tester' };
    authState.isLoading = false;
    metadataState.companyNames = ['Existing Co'];
    metadataState.artistNames = ['Existing Artist'];
    metadataState.isLoading = { companies: false, artists: false, tags: false };
  });

  it('keeps a saved draft inert until the user chooses what to do', async () => {
    const identity = {
      backendUrl: POCKETBASE_URL,
      accountId: authState.user!.id,
      kind: 'project-new' as const,
    };
    const generation = getDraftGeneration(identity)!;
    writeFormDraft(identity, generation, {
      fields: { title: 'Unfinished project', status: 'wishlist', tags: [] },
      hadNewPhoto: false,
    });

    renderWithProviders(<NewProject />);
    expect(await screen.findByRole('region', { name: 'Unfinished draft' })).toBeInTheDocument();
    expect(screen.getByTestId('project-form-sections').parentElement).toHaveAttribute('inert');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Discard draft' }));
    await waitFor(() =>
      expect(screen.getByTestId('project-form-sections').parentElement).not.toHaveAttribute('inert')
    );
  });

  it('shows form loading before the authenticated user owns form state', () => {
    const markup = renderToString(
      <TestWrapper queryClient={new QueryClient()}>
        <NewProject />
      </TestWrapper>
    );
    expect(markup).toContain('Loading your form…');
    expect(markup).not.toContain('project-form-sections');
  });

  it('renders the single-scroll section flow without tabs', () => {
    renderWithProviders(<NewProject />);

    expect(screen.getByRole('heading', { name: 'New project' })).toBeInTheDocument();
    expect(screen.getByTestId('project-form-sections')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('keeps restored edits visible after a late create and offers the created record', async () => {
    const unregister = registerSessionDraft('/projects/new:diamond', () => ({
      formData: { title: 'Original draft', tags: [{ id: 'tag-1' }] },
      companies: new Map(),
      artists: new Map(),
    }));
    captureSessionDrafts('abc123def456ghi', 'late-create-token');
    unregister();
    const user = userEvent.setup();
    renderWithProviders(<NewProject />);

    await user.click(screen.getByRole('button', { name: 'Fill sections' }));
    act(() => recordCompletedSessionCreate('late-create-token', 'projects', 'created-1'));

    expect(screen.getByTestId('project-form-sections')).toHaveTextContent('Galaxy Garden');
    expect(within(screen.getByTestId('late-project-creation')).getByRole('link')).toHaveAttribute(
      'href',
      '/projects/created-1'
    );
    expect(navigateMock).not.toHaveBeenCalledWith('/projects/created-1', expect.anything());
  });

  it('offers links to both projects created after a session change', () => {
    captureSessionDrafts('abc123def456ghi', 'two-project-token');
    renderWithProviders(<NewProject />);

    act(() => {
      recordCompletedSessionCreate('two-project-token', 'projects', 'created-1');
      recordCompletedSessionCreate('two-project-token', 'projects', 'created-2');
    });

    expect(
      within(screen.getByTestId('late-project-creation'))
        .getAllByRole('link')
        .map(link => link.getAttribute('href'))
    ).toEqual(['/projects/created-1', '/projects/created-2']);
  });

  it('checkpoints an unchanged recovered project before leaving the form', async () => {
    const unregister = registerSessionDraft('/projects/new:diamond', () => ({
      formData: {
        title: 'Recovered project',
        userId: 'abc123def456ghi',
        status: 'wishlist',
        tags: [],
      },
      companies: new Map(),
      artists: new Map(),
    }));
    captureSessionDrafts('abc123def456ghi', 'project-back-token');
    unregister();
    renderWithProviders(<NewProject />);
    await waitFor(() =>
      expect(screen.getByTestId('project-form-sections').parentElement).not.toHaveAttribute('inert')
    );

    await userEvent.setup().click(screen.getByRole('button', { name: 'Back' }));

    const identity = {
      backendUrl: POCKETBASE_URL,
      accountId: 'abc123def456ghi',
      kind: 'project-new' as const,
    };
    expect(
      readFormDraft(identity, getDraftGeneration(identity)!, isProjectDraftValues).draft?.values
        .fields.title
    ).toBe('Recovered project');
  });

  it('keeps the prior status when a completion date draft survives sign-in', async () => {
    const user = userEvent.setup();
    const first = renderWithProviders(<NewProject />);
    await user.click(screen.getByRole('button', { name: 'Set completion date' }));
    captureSessionDrafts('abc123def456ghi', 'project-status-token');
    expect(
      peekSessionDraft<{ statusBeforeDateChange: string }>(
        '/projects/new:diamond',
        'abc123def456ghi'
      )?.statusBeforeDateChange
    ).toBe('wishlist');
    first.unmount();

    renderWithProviders(<NewProject />);
    expect(screen.getByText('Prior status: wishlist')).toBeInTheDocument();
  });

  it('keeps the missing photo reminder after session recovery', () => {
    const unregister = registerSessionDraft('/projects/new:diamond', () => ({
      formData: {
        title: 'Recovered project',
        userId: 'abc123def456ghi',
        status: 'wishlist',
        tags: [],
      },
      missingPhoto: true,
      companies: new Map(),
      artists: new Map(),
    }));
    captureSessionDrafts('abc123def456ghi', 'missing-photo-token');
    unregister();

    renderWithProviders(<NewProject />);

    expect(screen.getByRole('status')).toHaveTextContent('Select your photo again before saving.');
  });

  it('restores the project when auth resolves after the page mounts', async () => {
    const unregister = registerSessionDraft('/projects/new:diamond', () => ({
      formData: {
        title: 'Recovered after login',
        userId: 'abc123def456ghi',
        status: 'wishlist',
        tags: [],
      },
      missingPhoto: true,
      companies: new Map(),
      artists: new Map(),
    }));
    captureSessionDrafts('abc123def456ghi', 'late-account-token');
    unregister();
    authState.user = null;
    const { rerender } = renderWithProviders(<NewProject />);

    authState.user = { id: 'abc123def456ghi', email: 'test@example.com', username: 'tester' };
    rerender(<NewProject />);

    expect(await screen.findByText('Section title: Recovered after login')).toBeInTheDocument();
    expect(screen.getByText('Select your photo again before saving.')).toBeInTheDocument();
  });

  it('keeps a create notice until its link is opened after sign-out and sign-in', async () => {
    captureSessionDrafts('abc123def456ghi', 'notice-token');
    const { rerender } = renderWithProviders(<NewProject />);
    act(() => recordCompletedSessionCreate('notice-token', 'projects', 'created-2'));
    expect(
      within(screen.getByTestId('late-project-creation')).getByRole('link')
    ).toBeInTheDocument();

    authState.user = null;
    clearSessionDrafts();
    rerender(<NewProject />);
    authState.user = { id: 'abc123def456ghi', email: 'test@example.com', username: 'tester' };
    rerender(<NewProject />);

    const link = await screen.findByRole('link', { name: 'Open created project' });
    expect(link).toHaveAttribute('href', '/projects/created-2');
    await userEvent.setup().click(link);
    expect(peekCompletedSessionDestinations('abc123def456ghi', '/projects/')).toEqual([]);
  });

  it('wires section state into the create flow and submits the current form data', async () => {
    const user = userEvent.setup();

    renderWithProviders(<NewProject />);

    expect(useCreateCompanyMock).toHaveBeenCalledWith({ notifyOnSuccess: false });
    expect(useCreateArtistMock).toHaveBeenCalledWith({ notifyOnSuccess: false });

    const createButton = screen.getByRole('button', { name: 'Create project' });
    expect(createButton).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Fill sections' }));
    expect(createButton).toBeEnabled();
    expect(createCompanyMutateAsync).not.toHaveBeenCalled();
    expect(createArtistMutateAsync).not.toHaveBeenCalled();

    await user.click(createButton);

    await waitFor(() => {
      expect(createCompanyMutateAsync).toHaveBeenCalledWith({
        name: 'New Co',
        website_url: 'https://new.example',
      });
      expect(createArtistMutateAsync).toHaveBeenCalledWith({ name: 'New Artist' });
      expect(createProjectMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Galaxy Garden',
          userId: 'abc123def456ghi',
          companyName: 'New Co',
          artistName: 'New Artist',
          status: 'wishlist',
          totalDiamonds: 12345,
          colorCount: 48,
          tagIds: ['abc123def456ghj'],
        })
      );
    });
  });

  it('stops project creation when a requested company cannot be created', async () => {
    createCompanyMutateAsync.mockRejectedValueOnce(new Error('Company service unavailable'));
    const user = userEvent.setup();
    renderWithProviders(<NewProject />);

    await user.click(screen.getByRole('button', { name: 'Fill sections' }));
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(createArtistMutateAsync).not.toHaveBeenCalled();
    expect(createProjectMutateAsync).not.toHaveBeenCalled();
  });

  it('warns without a false company failure after a session change', async () => {
    createCompanyMutateAsync.mockRejectedValueOnce(new SessionChangedError());
    const user = userEvent.setup();
    renderWithProviders(<NewProject />);

    await user.click(screen.getByRole('button', { name: 'Fill sections' }));
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(createCompanyMutateAsync).toHaveBeenCalledOnce());
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'warning' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(createProjectMutateAsync).not.toHaveBeenCalled();
  });

  it('keeps a new company after an uncertain artist save', async () => {
    createArtistMutateAsync.mockRejectedValueOnce(new SessionChangedError());
    const user = userEvent.setup();
    renderWithProviders(<NewProject />);

    await user.click(screen.getByRole('button', { name: 'Fill sections' }));
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(createArtistMutateAsync).toHaveBeenCalledOnce());
    expect(deleteCompany).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'warning' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(createProjectMutateAsync).not.toHaveBeenCalled();
  });

  it('removes a new company when artist creation fails before the project save', async () => {
    createArtistMutateAsync.mockRejectedValueOnce(new Error('Artist service unavailable'));
    const user = userEvent.setup();
    renderWithProviders(<NewProject />);

    await user.click(screen.getByRole('button', { name: 'Fill sections' }));
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(deleteCompany).toHaveBeenCalledWith('company-123'));
    expect(createProjectMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('reports a company left behind when rollback fails', async () => {
    createArtistMutateAsync.mockRejectedValueOnce(new Error('Artist service unavailable'));
    deleteCompany.mockRejectedValueOnce(new Error('Company delete unavailable'));
    const user = userEvent.setup();
    renderWithProviders(<NewProject />);

    await user.click(screen.getByRole('button', { name: 'Fill sections' }));
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    expect(await screen.findByText(/new company may still exist/)).toBeInTheDocument();
    expect(createProjectMutateAsync).not.toHaveBeenCalled();
  });

  it('removes newly created metadata when relation lookup fails before the project write', async () => {
    createProjectMutateAsync.mockRejectedValueOnce(
      new ProjectRelationLookupError('artist', new Error('Lookup unavailable'))
    );
    const user = userEvent.setup();
    renderWithProviders(<NewProject />);

    await user.click(screen.getByRole('button', { name: 'Fill sections' }));
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => {
      expect(deleteArtist).toHaveBeenCalledWith('artist-123');
      expect(deleteCompany).toHaveBeenCalledWith('company-123');
    });
    expect(createProjectMutateAsync).toHaveBeenCalledOnce();
  });

  it('removes newly created metadata after a definite project rejection', async () => {
    createProjectMutateAsync.mockRejectedValueOnce(
      Object.assign(new Error('Invalid project'), {
        type: 'validation',
        status: 400,
        retryable: false,
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<NewProject />);

    await user.click(screen.getByRole('button', { name: 'Fill sections' }));
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => {
      expect(deleteArtist).toHaveBeenCalledWith('artist-123');
      expect(deleteCompany).toHaveBeenCalledWith('company-123');
    });
  });

  it('keeps newly created metadata after an unconfirmed server response', async () => {
    createProjectMutateAsync.mockRejectedValueOnce(
      Object.assign(new Error('Gateway response after project write'), {
        type: 'server',
        status: 502,
        retryable: true,
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<NewProject />);

    await user.click(screen.getByRole('button', { name: 'Fill sections' }));
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(createProjectMutateAsync).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create project' })).toBeEnabled()
    );
    expect(deleteCompany).not.toHaveBeenCalled();
    expect(deleteArtist).not.toHaveBeenCalled();
  });

  it('keeps new metadata when the project write outcome is uncertain', async () => {
    createProjectMutateAsync.mockRejectedValueOnce(
      Object.assign(new Error('Response lost'), {
        type: 'network',
        status: 0,
        retryable: true,
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<NewProject />);

    await user.click(screen.getByRole('button', { name: 'Fill sections' }));
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(createProjectMutateAsync).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create project' })).toBeEnabled()
    );
    expect(deleteCompany).not.toHaveBeenCalled();
    expect(deleteArtist).not.toHaveBeenCalled();
  });

  it('reuses metadata created before an uncertain project write on retry', async () => {
    createProjectMutateAsync.mockRejectedValueOnce(
      Object.assign(new Error('Response lost'), { type: 'network', status: 0, retryable: true })
    );
    findCompany.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'company-123' });
    findArtist.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'artist-123' });
    const user = userEvent.setup();
    renderWithProviders(<NewProject />);

    await user.click(screen.getByRole('button', { name: 'Fill sections' }));
    const createButton = screen.getByRole('button', { name: 'Create project' });
    await user.click(createButton);
    await waitFor(() => expect(createButton).toBeEnabled());
    await user.click(createButton);

    await waitFor(() => expect(createProjectMutateAsync).toHaveBeenCalledTimes(2));
    expect(createCompanyMutateAsync).toHaveBeenCalledOnce();
    expect(createArtistMutateAsync).toHaveBeenCalledOnce();
    expect(findCompany).toHaveBeenCalledTimes(2);
    expect(findArtist).toHaveBeenCalledTimes(2);
  });

  it('shows inline field errors and clears them when the field changes', async () => {
    const user = userEvent.setup();

    renderWithProviders(<NewProject />);

    await user.click(screen.getByRole('button', { name: 'Fill invalid source' }));
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    expect(createProjectMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText('Source URL must be a valid URL if provided')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fill sections' }));

    expect(
      screen.queryByText('Source URL must be a valid URL if provided')
    ).not.toBeInTheDocument();
  });

  it('shows the login guard state when there is no authenticated user', () => {
    authState.user = null;

    renderWithProviders(<NewProject />);

    expect(screen.getByText('Please log in to create a new project.')).toBeInTheDocument();
    expect(screen.queryByTestId('project-form-sections')).not.toBeInTheDocument();
  });
});
