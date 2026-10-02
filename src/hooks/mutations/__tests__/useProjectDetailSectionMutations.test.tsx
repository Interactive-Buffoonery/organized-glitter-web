import {
  act,
  beforeEach,
  describe,
  expect,
  it,
  renderHookWithProviders,
  waitFor,
} from '@/test-utils';
import { createTestQueryClient } from '@/test-utils';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { vi } from 'vitest';

const {
  mockUpdate,
  mockUpdateWithCurrent,
  mockUseAuth,
  mockUseUserTimezone,
  mockBuildUpdateProjectFormData,
  mockValidateFormDataForUpdate,
  mockLogFormData,
  mockUpdateNote,
  mockRemoveNoteImage,
} = vi.hoisted(() => ({
  mockUpdate: vi.fn(),
  mockUpdateWithCurrent: vi.fn(),
  mockUseAuth: vi.fn(),
  mockUseUserTimezone: vi.fn(),
  mockBuildUpdateProjectFormData: vi.fn(),
  mockValidateFormDataForUpdate: vi.fn(),
  mockLogFormData: vi.fn(),
  mockUpdateNote: vi.fn(),
  mockRemoveNoteImage: vi.fn(),
}));

vi.doMock('@/services/pocketbase/projects.service', () => ({
  projectsService: {
    update: mockUpdate,
    updateWithCurrent: mockUpdateWithCurrent,
  },
}));

vi.doMock('@/services/pocketbase/progressNotes.service', () => ({
  ProgressNotesService: {
    updateContent: mockUpdateNote,
    removeImage: mockRemoveNoteImage,
  },
}));

vi.doMock('@/hooks/useAuth', () => ({
  useAuth: mockUseAuth,
}));

vi.doMock('@/hooks/useUserTimezone', () => ({
  useUserTimezone: mockUseUserTimezone,
}));

vi.doMock('../projectMutationAdapters', () => ({
  buildUpdateProjectFormData: mockBuildUpdateProjectFormData,
}));

vi.doMock('@/utils/project/formdata-builder', () => ({
  validateFormDataForUpdate: mockValidateFormDataForUpdate,
  logFormData: mockLogFormData,
}));

const {
  useUpdateProjectDatesSectionMutation,
  useUpdateProjectNotesSectionMutation,
  useUpdateProgressNoteMutation,
  useDeleteProgressNoteImageMutation,
} = await import('../useProjectDetailMutations');

describe('project detail section mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: { id: 'user-123' },
    });
    mockUseUserTimezone.mockReturnValue('America/New_York');
    mockBuildUpdateProjectFormData.mockResolvedValue(new FormData());
    mockValidateFormDataForUpdate.mockReturnValue({ isValid: true, errors: [] });
    const savedProject = {
      id: 'project-dates',
      status: 'progress',
      datePurchased: '2025-01-01',
      dateReceived: '2025-01-02',
      dateStarted: '',
      dateCompleted: '',
    };
    mockUpdateWithCurrent.mockImplementation(async (_id, _fields, buildData) => {
      await buildData(savedProject);
      return mockUpdate();
    });
  });

  it('optimistically updates notes and rolls back on error', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.projects.detail('project-123'), {
      id: 'project-123',
      generalNotes: 'Before',
    });

    mockUpdate.mockRejectedValue(new Error('save failed'));

    const { result } = renderHookWithProviders(() => useUpdateProjectNotesSectionMutation(), {
      queryClient,
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          projectId: 'project-123',
          notes: 'After',
        })
      ).rejects.toThrow('save failed');
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(queryKeys.projects.detail('project-123'))).toEqual({
        id: 'project-123',
        generalNotes: 'Before',
      });
    });
  });

  it('optimistically patches dates and rolls back on error', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.projects.detail('project-dates'), {
      id: 'project-dates',
      datePurchased: '2025-01-01',
      dateReceived: '2025-01-02',
    });

    mockUpdate.mockRejectedValue(new Error('date save failed'));

    const { result } = renderHookWithProviders(() => useUpdateProjectDatesSectionMutation(), {
      queryClient,
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          projectId: 'project-dates',
          datePurchased: '2025-02-01',
          dateReceived: '2025-02-02',
        })
      ).rejects.toThrow('date save failed');
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(queryKeys.projects.detail('project-dates'))).toEqual({
        id: 'project-dates',
        datePurchased: '2025-01-01',
        dateReceived: '2025-01-02',
      });
    });
  });

  it('keeps the saved completion status when detail refresh is unavailable', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.projects.detail('project-dates'), {
      id: 'project-dates',
      status: 'progress',
      dateCompleted: '',
      title: 'Saved project',
    });
    mockUpdate.mockResolvedValue({ id: 'project-dates', status: 'completed' });

    const { result } = renderHookWithProviders(() => useUpdateProjectDatesSectionMutation(), {
      queryClient,
    });

    await act(async () => {
      await result.current.mutateAsync({
        projectId: 'project-dates',
        dateCompleted: '2025-03-01',
      });
    });

    expect(queryClient.getQueryData(queryKeys.projects.detail('project-dates'))).toMatchObject({
      status: 'completed',
      dateCompleted: '2025-03-01',
      title: 'Saved project',
    });
    expect(mockBuildUpdateProjectFormData.mock.calls[0][0]).not.toHaveProperty('status');
  });

  it('keeps untouched dates during an inline date save', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setDefaultOptions({ queries: { gcTime: Infinity } });
    queryClient.setQueryData(queryKeys.projects.detail('project-dates'), {
      id: 'project-dates',
      datePurchased: '2025-01-01',
      dateReceived: '2025-01-02',
      dateStarted: '2025-02-01',
      dateCompleted: '',
    });
    mockUpdate.mockResolvedValue({ id: 'project-dates' });

    const { result } = renderHookWithProviders(() => useUpdateProjectDatesSectionMutation(), {
      queryClient,
    });
    await act(async () => {
      await result.current.mutateAsync({
        projectId: 'project-dates',
        dateCompleted: '2025-03-01',
      });
    });
    expect(queryClient.getQueryData(queryKeys.projects.detail('project-dates'))).toEqual({
      id: 'project-dates',
      datePurchased: '2025-01-01',
      dateReceived: '2025-01-02',
      dateStarted: '2025-02-01',
      dateCompleted: '2025-03-01',
    });
  });

  it('lets the server set completion status without overwriting a concurrent archive', async () => {
    const queryClient = createTestQueryClient();
    mockUpdate.mockResolvedValue({ id: 'project-dates', status: 'completed' });
    const { result } = renderHookWithProviders(() => useUpdateProjectDatesSectionMutation(), {
      queryClient,
    });

    await act(async () => {
      await result.current.mutateAsync({
        projectId: 'project-dates',
        dateCompleted: '2025-03-01',
      });
    });
    expect(mockBuildUpdateProjectFormData).toHaveBeenCalledWith(
      expect.objectContaining({ dateCompleted: '2025-03-01' }),
      'user-123',
      'America/New_York'
    );
    expect(mockUpdateWithCurrent).toHaveBeenCalledWith(
      'project-dates',
      ['status', 'date_purchased', 'date_started', 'date_completed'],
      expect.any(Function)
    );
    expect(mockBuildUpdateProjectFormData.mock.calls[0][0]).not.toHaveProperty('status');

    mockUpdateWithCurrent.mockImplementationOnce(async (_id, _fields, buildData) => {
      await buildData({
        status: 'progress',
        datePurchased: '2025-01-01',
        dateStarted: '2025-02-01',
        dateCompleted: '',
      });
      return mockUpdate();
    });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ projectId: 'project-dates', dateCompleted: '2025-01-15' })
      ).rejects.toMatchObject({ reason: 'completion_before_start' });
    });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('keeps an archived status while a completion date save is pending', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryDefaults(queryKeys.projects.detail('project-dates'), { gcTime: 60_000 });
    queryClient.setQueryData(queryKeys.projects.detail('project-dates'), {
      id: 'project-dates',
      status: 'archived',
      dateCompleted: '',
    });
    let finishUpdate!: (value: { id: string; status: string }) => void;
    mockUpdate.mockImplementationOnce(() => new Promise(resolve => (finishUpdate = resolve)));

    const { result } = renderHookWithProviders(() => useUpdateProjectDatesSectionMutation(), {
      queryClient,
    });

    act(() => {
      result.current.mutate({
        projectId: 'project-dates',
        dateCompleted: '2025-03-01',
      });
    });

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledOnce());
    expect(queryClient.getQueryData(queryKeys.projects.detail('project-dates'))).toMatchObject({
      status: 'archived',
      dateCompleted: '2025-03-01',
    });

    await act(async () => {
      finishUpdate({ id: 'project-dates', status: 'archived' });
    });
  });

  it('rejects an invalid inline date before building a status update', async () => {
    const { result } = renderHookWithProviders(() => useUpdateProjectDatesSectionMutation());

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          projectId: 'project-dates',
          dateCompleted: 'not-a-date',
        })
      ).rejects.toMatchObject({ reason: 'invalid_date' });
    });

    expect(mockUpdateWithCurrent).not.toHaveBeenCalled();
    expect(mockBuildUpdateProjectFormData).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('refreshes Overview but keeps diamond aggregates cached after a notes-only save', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
    const key = queryKeys.stats.summary('user-123', 2026);
    const overviewKey = queryKeys.stats.overview('user-123');
    const readStats = vi.fn().mockResolvedValue({ completed: 1 });
    const readOverview = vi.fn().mockResolvedValue({ items: [] });
    await queryClient.fetchQuery({ queryKey: key, queryFn: readStats, staleTime: Infinity });
    await queryClient.fetchQuery({
      queryKey: overviewKey,
      queryFn: readOverview,
      staleTime: Infinity,
    });
    mockUpdate.mockResolvedValue({ id: 'project-123', generalNotes: 'After' });

    const { result } = renderHookWithProviders(() => useUpdateProjectNotesSectionMutation(), {
      queryClient,
    });
    await act(async () => {
      await result.current.mutateAsync({ projectId: 'project-123', notes: 'After' });
    });
    await queryClient.fetchQuery({ queryKey: key, queryFn: readStats, staleTime: Infinity });
    await queryClient.fetchQuery({
      queryKey: overviewKey,
      queryFn: readOverview,
      staleTime: Infinity,
    });

    expect(readStats).toHaveBeenCalledTimes(1);
    expect(readOverview).toHaveBeenCalledTimes(2);
  });

  it('refreshes diamond Stats but keeps coloring Stats cached after a date save', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
    const key = queryKeys.stats.completionsByMonth('user-123', 2026);
    const coloringKey = queryKeys.stats.coloringSummary('user-123', 2026);
    const readStats = vi.fn().mockResolvedValue({ completed: 1 });
    const readColoringStats = vi.fn().mockResolvedValue({ completed: 1 });
    await queryClient.fetchQuery({ queryKey: key, queryFn: readStats, staleTime: Infinity });
    await queryClient.fetchQuery({
      queryKey: coloringKey,
      queryFn: readColoringStats,
      staleTime: Infinity,
    });
    mockUpdate.mockResolvedValue({ id: 'project-123', dateCompleted: '2026-01-02' });

    const { result } = renderHookWithProviders(() => useUpdateProjectDatesSectionMutation(), {
      queryClient,
    });
    await act(async () => {
      await result.current.mutateAsync({ projectId: 'project-123', dateCompleted: '2026-01-02' });
    });
    await queryClient.fetchQuery({ queryKey: key, queryFn: readStats, staleTime: Infinity });
    await queryClient.fetchQuery({
      queryKey: coloringKey,
      queryFn: readColoringStats,
      staleTime: Infinity,
    });

    expect(readStats).toHaveBeenCalledTimes(2);
    expect(readColoringStats).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      operation: 'content edit',
      useMutation: useUpdateProgressNoteMutation,
      service: mockUpdateNote,
      variables: { noteId: 'note-1', projectId: 'project-123', content: 'Updated' },
    },
    {
      operation: 'image removal',
      useMutation: useDeleteProgressNoteImageMutation,
      service: mockRemoveNoteImage,
      variables: { noteId: 'note-1', projectId: 'project-123', content: 'Updated' },
    },
  ])(
    'keeps Overview cached after project note $operation',
    async ({ useMutation, service, variables }) => {
      const queryClient = createTestQueryClient();
      queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
      const key = queryKeys.stats.overview('user-123');
      const readOverview = vi.fn().mockResolvedValue({ items: [] });
      await queryClient.fetchQuery({ queryKey: key, queryFn: readOverview, staleTime: Infinity });
      service.mockResolvedValue({ id: 'note-1' });

      const { result } = renderHookWithProviders(() => useMutation(), { queryClient });
      await act(async () => {
        await result.current.mutateAsync(variables);
      });
      await queryClient.fetchQuery({ queryKey: key, queryFn: readOverview, staleTime: Infinity });

      expect(readOverview).toHaveBeenCalledTimes(1);
    }
  );
});
