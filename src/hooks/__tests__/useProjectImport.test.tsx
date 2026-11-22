import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  getLibraryMatchFields: vi.fn(),
  createTag: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@/services/auth', () => ({
  isAuthenticated: () => true,
  getCurrentUser: () => ({ id: 'user-1' }),
}));
vi.mock('@/hooks/useImportCreateProject', () => ({
  useImportCreateProject: () => ({ createProject: mocks.createProject }),
}));
vi.mock('@/services/pocketbase/projects.service', () => ({
  projectsService: { getLibraryMatchFields: mocks.getLibraryMatchFields },
}));
vi.mock('@/services/pocketbase/importTags.service', () => ({
  ImportTagsService: {
    listUserTags: vi.fn(async () => []),
    slugExists: vi.fn(async () => false),
    createTag: mocks.createTag,
  },
}));
vi.mock('@/lib/notifications', () => ({ notify: mocks.notify }));
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

const importCsv = async (csv: string) => {
  const { result } = renderHook(() => useProjectImport(), { wrapper });
  await act(async () => {
    await result.current.importProjectsFromCSV(
      new File([csv], 'projects.csv', { type: 'text/csv' })
    );
  });
  return result.current.importStats;
};

const shortenedTitle = `${'x'.repeat(197)}...`;

const importedTitles = () => mocks.createProject.mock.calls.map(([project]) => project.title);

describe('Organized Glitter CSV import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createProject.mockResolvedValue({ id: 'created' });
    mocks.createTag.mockImplementation(async ({ name }) => ({ id: `tag-${name}` }));
    mocks.getLibraryMatchFields.mockResolvedValue([]);
  });

  it('skips rows that match a kit already in the library and reports them', async () => {
    mocks.getLibraryMatchFields.mockResolvedValue([
      { title: 'Galaxy Cat', company: 'Diamond Art Club' },
      { title: 'Moon Fox' },
    ]);

    const stats = await importCsv(
      'Title,Company\n' +
        '"  galaxy   CAT ",diamond art club\n' +
        'Galaxy Cat,Other Company\n' +
        'Moon Fox,\n' +
        'Sun Owl,Diamond Art Club\n'
    );

    expect(importedTitles()).toEqual(['Galaxy Cat', 'Sun Owl']);
    expect(stats).toMatchObject({ successful: 2, failed: 0, skipped: 2, total: 4 });
    expect(stats.skippedRows).toEqual([
      { row: 2, title: 'galaxy   CAT' },
      { row: 4, title: 'Moon Fox' },
    ]);
  });

  it('skips only as many copies as the library already holds', async () => {
    mocks.getLibraryMatchFields.mockResolvedValue([{ title: 'Galaxy Cat' }]);

    const stats = await importCsv('Title\nGalaxy Cat\nGalaxy Cat\nGalaxy Cat\n');

    expect(importedTitles()).toEqual(['Galaxy Cat', 'Galaxy Cat']);
    expect(stats).toMatchObject({ successful: 2, skipped: 1 });
  });

  it('matches a long title against the shortened title already in the library', async () => {
    const longTitle = 'x'.repeat(240);
    mocks.getLibraryMatchFields.mockResolvedValue([{ title: shortenedTitle }]);

    const stats = await importCsv(`Title\n${longTitle}\n`);

    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(stats).toMatchObject({ successful: 0, skipped: 1, validationIssues: [] });
  });

  it('reports a shortened title as a validation issue on its row', async () => {
    const longTitle = 'x'.repeat(240);

    const stats = await importCsv(`Title\nShort\n${longTitle}\n`);

    expect(importedTitles()[1]).toBe(shortenedTitle);
    expect(stats.validationIssues).toEqual([
      expect.objectContaining({
        row: 3,
        field: 'title',
        message: 'Title shortened to the 200 character limit.',
      }),
    ]);
  });

  it('matches a long title against the full title already in the library', async () => {
    const longTitle = 'x'.repeat(220);
    mocks.getLibraryMatchFields.mockResolvedValue([{ title: longTitle }]);

    const stats = await importCsv(`Title\n${longTitle}\n`);

    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(stats).toMatchObject({ successful: 0, skipped: 1 });
  });

  it('treats the company "other" as no company, the way it is saved', async () => {
    mocks.getLibraryMatchFields.mockResolvedValue([{ title: 'Galaxy Cat' }, { title: 'Moon Fox' }]);

    const stats = await importCsv('Title,Company\nGalaxy Cat,other\nMoon Fox,\n');

    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(stats).toMatchObject({ skipped: 2 });
  });

  it('creates tags only for rows that will be imported', async () => {
    mocks.getLibraryMatchFields.mockResolvedValue([{ title: 'Galaxy Cat' }]);

    await importCsv('Title,Tags\nGalaxy Cat,Old Tag\nSun Owl,New Tag\n');

    expect(mocks.createTag.mock.calls.map(([tag]) => tag.name)).toEqual(['New Tag']);
    expect(mocks.createProject).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Sun Owl', tagIds: ['tag-New Tag'] })
    );
  });

  it('creates no tags when the library lookup fails', async () => {
    mocks.getLibraryMatchFields.mockRejectedValue(new Error('offline'));

    await importCsv('Title,Tags\nSun Owl,New Tag\n');

    expect(mocks.createTag).not.toHaveBeenCalled();
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it('says plainly when every row was already in the library', async () => {
    mocks.getLibraryMatchFields.mockResolvedValue([{ title: 'Galaxy Cat' }]);

    await importCsv('Title\nGalaxy Cat\n');

    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Skipped 1 row already in your library.' })
    );
  });
});
