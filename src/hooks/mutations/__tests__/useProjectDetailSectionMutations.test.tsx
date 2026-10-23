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

const { useUpdateProjectDatesSectionMutation, useUpdateProjectNotesSectionMutation } =
  await import('../useProjectDetailMutations');

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
});
