import '@testing-library/jest-dom/vitest';
import React from 'react';
import { within } from '@testing-library/react';
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
import {
  captureSessionDrafts,
  clearSessionDrafts,
  recordCompletedSessionCreate,
  registerSessionDraft,
  SessionChangedError,
} from '@/services/auth/sessionRecovery';
import { getDraftGeneration, readFormDraft, writeFormDraft } from '@/hooks/drafts/formDraftStorage';
import { isProjectDraftValues } from '@/hooks/drafts/formDraftAdapters';
import { POCKETBASE_URL } from '@/lib/pocketbaseConfig';

const navigateMock = vi.fn();
const {
  toastMock,
  sessionState,
  deleteCompany,
  deleteArtist,
  findCompany,
  findArtist,
  useCreateCompanyMock,
  useCreateArtistMock,
} = vi.hoisted(() => ({
  toastMock: vi.fn(),
  sessionState: { generation: 0, accountId: 'abc123def456ghi' as string | null },
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

vi.mock('@/services/auth/sessionIdentity', () => ({
  captureSessionIdentity: () => ({ ...sessionState }),
  isCurrentSessionIdentity: (identity: { generation: number; accountId: string | null }) =>
    identity.generation === sessionState.generation &&
    identity.accountId === sessionState.accountId,
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
    sessionState.generation = 0;
    sessionState.accountId = 'abc123def456ghi';
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

  it('keeps restored edits visible after a late create and offers the created record', async () => {
    const unregister = registerSessionDraft('/projects/new:diamond', 'abc123def456ghi', () => ({
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

  it('checkpoints an unchanged recovered project before leaving the form', async () => {
    const unregister = registerSessionDraft('/projects/new:diamond', 'abc123def456ghi', () => ({
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

  it('keeps the missing photo reminder after session recovery', () => {
    const unregister = registerSessionDraft('/projects/new:diamond', 'abc123def456ghi', () => ({
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

    await waitFor(() =>
      expect(deleteCompany).toHaveBeenCalledWith('company-123', {
        accountId: 'abc123def456ghi',
        generation: 0,
      })
    );
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

  it('ignores a stale rendered account before preparing project metadata', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewProject />);
    await user.click(screen.getByRole('button', { name: 'Fill sections' }));

    sessionState.accountId = 'newaccount12345';
    sessionState.generation += 1;
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    expect(findCompany).not.toHaveBeenCalled();
    expect(createCompanyMutateAsync).not.toHaveBeenCalled();
    expect(findArtist).not.toHaveBeenCalled();
    expect(createArtistMutateAsync).not.toHaveBeenCalled();
    expect(createProjectMutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('stops rollback between deletes when the session changes', async () => {
    createProjectMutateAsync.mockRejectedValueOnce(
      Object.assign(new Error('Invalid project'), {
        type: 'validation',
        status: 400,
        retryable: false,
      })
    );
    deleteArtist.mockImplementationOnce(async () => {
      sessionState.generation += 1;
    });
    const user = userEvent.setup();
    renderWithProviders(<NewProject />);

    await user.click(screen.getByRole('button', { name: 'Fill sections' }));
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() =>
      expect(deleteArtist).toHaveBeenCalledWith('artist-123', {
        accountId: 'abc123def456ghi',
        generation: 0,
      })
    );
    expect(deleteCompany).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps a new account submission busy when an old submission fails', async () => {
    let rejectOld!: (error: Error) => void;
    createProjectMutateAsync.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectOld = reject;
        })
    );
    createProjectMutateAsync.mockImplementationOnce(() => new Promise(() => {}));
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(<NewProject />);
    await user.click(screen.getByRole('button', { name: 'Fill sections' }));
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(createProjectMutateAsync).toHaveBeenCalledOnce());

    sessionState.generation += 1;
    sessionState.accountId = 'newaccount12345';
    authState.user = { id: 'newaccount12345', email: 'new@example.com', username: 'new' };
    rerender(<NewProject />);
    await user.click(screen.getByRole('button', { name: 'Fill sections' }));
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(createProjectMutateAsync).toHaveBeenCalledTimes(2));

    await act(async () => rejectOld(new Error('Old submission failed')));
    expect(screen.getByRole('button', { name: 'Creating...' })).toBeDisabled();
    expect(deleteCompany).not.toHaveBeenCalled();
    expect(deleteArtist).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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
      expect(deleteArtist).toHaveBeenCalledWith('artist-123', {
        accountId: 'abc123def456ghi',
        generation: 0,
      });
      expect(deleteCompany).toHaveBeenCalledWith('company-123', {
        accountId: 'abc123def456ghi',
        generation: 0,
      });
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
});
