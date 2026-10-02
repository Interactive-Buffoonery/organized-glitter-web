import {
  act,
  beforeEach,
  createTestQueryClient,
  describe,
  expect,
  it,
  renderHookWithProviders,
  waitFor,
} from '@/test-utils';
import { vi } from 'vitest';
import { queryKeys } from '@/hooks/queries/queryKeys';

const {
  mockUpdate,
  mockUseAuth,
  mockUseUserTimezone,
  mockBuildUpdateProjectFormData,
  mockValidateFormDataForUpdate,
  mockLogFormData,
  mockCapture,
} = vi.hoisted(() => ({
  mockUpdate: vi.fn(),
  mockUseAuth: vi.fn(),
  mockUseUserTimezone: vi.fn(),
  mockBuildUpdateProjectFormData: vi.fn(),
  mockValidateFormDataForUpdate: vi.fn(),
  mockLogFormData: vi.fn(),
  mockCapture: vi.fn(),
}));

vi.doMock('@/services/pocketbase/projects.service', () => ({
  projectsService: {
    update: mockUpdate,
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

vi.doMock('@/services/analytics-escape-hatch', () => ({
  capture: mockCapture,
}));

const { useProjectUpdateUnified } = await import('../useProjectUpdateUnified');

describe('useProjectUpdateUnified', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: { id: 'user-123' },
    });
    mockUseUserTimezone.mockReturnValue('America/New_York');
    mockBuildUpdateProjectFormData.mockResolvedValue(new FormData());
    mockValidateFormDataForUpdate.mockReturnValue({ isValid: true, errors: [] });
  });

  it('reports an authentication error before building or writing when signed out', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHookWithProviders(() => useProjectUpdateUnified());
    await act(async () => {
      await expect(
        result.current.mutateAsync({ projectId: 'project-123', title: 'After' })
      ).rejects.toMatchObject({ type: 'auth', retryable: false });
    });
    expect(mockBuildUpdateProjectFormData).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rolls back without retrying when the update response is lost', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
    queryClient.setQueryData(['projects', 'detail', 'project-123'], {
      id: 'project-123',
      title: 'Before',
      status: 'wishlist',
    });

    const ambiguousFailure = {
      type: 'network',
      message: 'response lost after server commit',
      retryable: true,
    };
    mockUpdate.mockRejectedValue(ambiguousFailure);

    const { result } = renderHookWithProviders(() => useProjectUpdateUnified(), { queryClient });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          projectId: 'project-123',
          title: 'After',
          status: 'progress',
        })
      ).rejects.toMatchObject(ambiguousFailure);
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(['projects', 'detail', 'project-123'])).toEqual({
        id: 'project-123',
        title: 'Before',
        status: 'wishlist',
      });
    });

    expect(mockLogFormData).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('applies optimistic patch, returns server data, and invalidates caches on success', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.projects.detail('project-abc'), {
      id: 'project-abc',
      title: 'Before',
      status: 'wishlist',
      generalNotes: 'old',
    });

    mockUpdate.mockResolvedValue({
      id: 'project-abc',
      title: 'After',
      status: 'progress',
      generalNotes: 'new',
      image: 'cover.webp',
      sourceUrl: '',
      width: 20,
      height: undefined,
    });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHookWithProviders(() => useProjectUpdateUnified(), { queryClient });

    let returned: unknown;
    await act(async () => {
      returned = await result.current.mutateAsync({
        projectId: 'project-abc',
        title: 'After',
        status: 'progress',
        generalNotes: 'new',
      });
    });

    expect(returned).toMatchObject({ id: 'project-abc', title: 'After', status: 'progress' });

    expect(mockCapture).toHaveBeenCalledWith('project_updated', {
      surface: 'edit_project',
      status: 'progress',
      has_image: true,
      has_notes: true,
      has_source_url: false,
      has_dimensions: true,
    });

    await waitFor(() => {
      const keys = invalidateSpy.mock.calls.map(call => JSON.stringify(call[0]?.queryKey));
      expect(keys).toEqual(
        expect.arrayContaining([
          JSON.stringify(queryKeys.projects.detail('project-abc')),
          JSON.stringify(queryKeys.projects.lists()),
          JSON.stringify(queryKeys.stats.all),
        ])
      );
    });
  });

  it('refreshes every cached diamond Stats projection after a project write', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
    const diamondKeys = [
      queryKeys.stats.overview('user-123'),
      queryKeys.stats.availableYears('user-123'),
      queryKeys.stats.summary('user-123', 2025),
      queryKeys.stats.completionsByMonth('user-123', 2025),
      queryKeys.stats.completionsYearly('user-123'),
      queryKeys.stats.completionTimes('user-123'),
      queryKeys.stats.collection('user-123'),
    ];
    const coloringKey = queryKeys.stats.coloringSummary('user-123', 2025);
    const reads = [...diamondKeys, coloringKey].map(() =>
      vi.fn().mockResolvedValue({ fresh: true })
    );

    const initialResults = await Promise.allSettled(
      [...diamondKeys, coloringKey].map((queryKey, index) =>
        queryClient.fetchQuery({ queryKey, queryFn: reads[index], staleTime: Infinity })
      )
    );
    expect(initialResults.every(result => result.status === 'fulfilled')).toBe(true);
    mockUpdate.mockResolvedValue({ id: 'project-abc', status: 'completed' });

    const { result } = renderHookWithProviders(() => useProjectUpdateUnified(), { queryClient });
    await act(async () => {
      await result.current.mutateAsync({ projectId: 'project-abc', title: 'Updated' });
    });

    const refreshedResults = await Promise.allSettled(
      [...diamondKeys, coloringKey].map((queryKey, index) =>
        queryClient.fetchQuery({ queryKey, queryFn: reads[index], staleTime: Infinity })
      )
    );
    expect(refreshedResults.every(result => result.status === 'fulfilled')).toBe(true);

    diamondKeys.forEach((_, index) => expect(reads[index]).toHaveBeenCalledTimes(2));
    expect(reads[diamondKeys.length]).toHaveBeenCalledTimes(1);
  });

  it('optimistically coerces a null drillShape to empty string in the detail cache', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
    queryClient.setQueryData(queryKeys.projects.detail('project-drill'), {
      id: 'project-drill',
      title: 'Before',
      drillShape: 'round',
    });

    mockUpdate.mockResolvedValue({ id: 'project-drill', drillShape: '' });

    const { result } = renderHookWithProviders(() => useProjectUpdateUnified(), { queryClient });

    await act(async () => {
      await result.current.mutateAsync({
        projectId: 'project-drill',
        title: 'Before',
        drillShape: null,
      });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(queryKeys.projects.detail('project-drill'))).toMatchObject({
        id: 'project-drill',
        drillShape: '',
      });
    });
  });

  it('optimistically reflects explicit full-form clears in the detail cache', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.projects.detail('project-clear'), {
      id: 'project-clear',
      title: 'Before',
      company: 'Company',
      artist: 'Artist',
      datePurchased: '2026-05-01',
      width: 30,
      generalNotes: 'Notes',
      sourceUrl: 'https://example.com',
    });

    mockUpdate.mockResolvedValue({ id: 'project-clear', title: 'Before' });

    const { result } = renderHookWithProviders(() => useProjectUpdateUnified(), { queryClient });

    await act(async () => {
      await result.current.mutateAsync({
        projectId: 'project-clear',
        title: 'Before',
        companyName: null,
        artistName: null,
        datePurchased: null,
        width: null,
        generalNotes: null,
        sourceUrl: null,
      });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(queryKeys.projects.detail('project-clear'))).toMatchObject({
        company: '',
        artist: '',
        width: undefined,
        datePurchased: undefined,
        generalNotes: '',
        sourceUrl: '',
      });
    });
  });

  it('leaves omitted fields unchanged in the optimistic detail cache', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.projects.detail('project-image'), {
      id: 'project-image',
      title: 'Before',
      status: 'progress',
      company: 'Company',
      datePurchased: '2026-05-01',
      width: 30,
      generalNotes: 'Keep these notes',
    });

    mockUpdate.mockResolvedValue({ id: 'project-image', title: 'Before' });

    const { result } = renderHookWithProviders(() => useProjectUpdateUnified(), { queryClient });

    await act(async () => {
      await result.current.mutateAsync({
        projectId: 'project-image',
        title: 'Before',
        imageFile: new File(['replacement'], 'replacement.jpg', { type: 'image/jpeg' }),
      });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(queryKeys.projects.detail('project-image'))).toMatchObject({
        status: 'progress',
        company: 'Company',
        datePurchased: '2026-05-01',
        width: 30,
        generalNotes: 'Keep these notes',
      });
    });
  });

  it('throws a validation error and rolls back the optimistic patch when title is missing', async () => {
    const queryClient = createTestQueryClient();
    const previous = {
      id: 'project-xyz',
      title: 'Before',
      status: 'wishlist',
    };
    queryClient.setQueryData(queryKeys.projects.detail('project-xyz'), previous);

    mockValidateFormDataForUpdate.mockReturnValue({
      isValid: false,
      errors: ['title is required'],
    });

    const { result } = renderHookWithProviders(() => useProjectUpdateUnified(), { queryClient });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          projectId: 'project-xyz',
          title: '',
          status: 'progress',
        })
      ).rejects.toThrow(/Validation failed/);
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(queryKeys.projects.detail('project-xyz'))).toEqual(previous);
    });

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('retires a draft after the server write even when later effects fail', async () => {
    const queryClient = createTestQueryClient();
    vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(() => {
      throw new Error('Cache refresh failed');
    });
    const savedProject = { id: 'project-123', title: 'Saved' };
    const onConfirmedSave = vi.fn();
    mockUpdate.mockResolvedValue(savedProject);
    mockCapture.mockImplementationOnce(() => {
      throw new Error('Analytics failed');
    });
    const { result } = renderHookWithProviders(() => useProjectUpdateUnified(), { queryClient });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          projectId: 'project-123',
          title: 'Saved',
          onConfirmedSave,
        })
      ).resolves.toEqual(savedProject);
    });

    expect(onConfirmedSave).toHaveBeenCalledOnce();
    expect(mockUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      onConfirmedSave.mock.invocationCallOrder[0]
    );
  });

  it('keeps the draft when the server write fails', async () => {
    const onConfirmedSave = vi.fn();
    mockUpdate.mockRejectedValue(new Error('Network failed'));
    const { result } = renderHookWithProviders(() => useProjectUpdateUnified());

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          projectId: 'project-123',
          title: 'Unsaved',
          onConfirmedSave,
        })
      ).rejects.toThrow('Network failed');
    });

    expect(onConfirmedSave).not.toHaveBeenCalled();
  });
});
