import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listUserTags: vi.fn(),
  createTag: vi.fn(),
  createProject: vi.fn(),
  parseCsv: vi.fn(),
}));

vi.mock('@/services/auth', () => ({
  isAuthenticated: () => true,
  getCurrentUser: () => ({ id: 'user-1' }),
}));
vi.mock('@/services/pocketbase/importTags.service', () => ({
  ImportTagsService: {
    listUserTags: mocks.listUserTags,
    createTag: mocks.createTag,
    slugExists: vi.fn(async () => false),
  },
}));
vi.mock('@/hooks/useImportCreateProject', () => ({
  useImportCreateProject: () => ({ createProject: mocks.createProject }),
}));
vi.mock('@/utils/csv/csvImport', () => ({ parseCsvFileToProjects: mocks.parseCsv }));
vi.mock('@/utils/csv/csvColumnAnalysis', () => ({
  analyzeCSVFile: vi.fn(async () => ({
    detectedColumns: [],
    missingRequired: [],
    missingOptional: [],
    unmappedColumns: [],
    summary: {},
  })),
  generateColumnValidationMessage: () => ({ canProceed: true, severity: 'none', message: '' }),
}));
vi.mock('@/services/pocketbase/projects.service', () => ({ projectsService: {} }));
vi.mock('@/lib/notifications', () => ({ notify: vi.fn() }));
vi.mock('@/features/import-export/importExportTelemetry', () => ({
  captureImportExportEvent: vi.fn(),
  captureImportExportException: vi.fn(),
  getDurationMs: vi.fn(() => 0),
  getImportExportStatus: vi.fn(() => 'success'),
}));
vi.mock('@/features/import-export/archive/importInvalidation', () => ({
  invalidateImportExportQueries: vi.fn(async () => undefined),
  refreshImportExportQueriesBestEffort: vi.fn(async () => undefined),
}));

import { useProjectImport } from '@/hooks/useProjectImport';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

async function importTag(...tagNames: string[]) {
  mocks.parseCsv.mockResolvedValue({
    projects: [{ title: 'Galaxy Cat', tagNames }],
    allUniqueTagNames: tagNames,
  });
  const { result } = renderHook(() => useProjectImport(), { wrapper });
  await act(async () => {
    await result.current.importProjectsFromCSV(new File(['title'], 'projects.csv'));
  });
  return mocks.createProject.mock.calls[0]?.[0]?.tagIds;
}

describe('CSV import tags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createProject.mockResolvedValue({});
  });

  it('reuses a tag created at the same moment when its create is rejected', async () => {
    mocks.listUserTags
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ id: 'tag-cats', name: 'cats' }]);
    mocks.createTag.mockRejectedValue(new Error('A tag named "cats" already exists.'));

    expect(await importTag('CATS')).toEqual(['tag-cats']);
  });

  it('attaches the exact spelling when legacy case duplicates exist', async () => {
    mocks.listUserTags.mockResolvedValue([
      { id: 'tag-cats', name: 'cats' },
      { id: 'tag-capital-cats', name: 'Cats' },
    ]);

    expect(await importTag('cats')).toEqual(['tag-cats']);
    expect(mocks.createTag).not.toHaveBeenCalled();
  });

  it('links a tag once when a row lists it in two spellings', async () => {
    mocks.listUserTags.mockResolvedValue([{ id: 'tag-cats', name: 'cats' }]);

    expect(await importTag('cats', 'CATS')).toEqual(['tag-cats']);
  });
});
