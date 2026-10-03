import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    importProjectsFromCSV: vi.fn(),
    importDacProjectsFromCSV: vi.fn(),
    exportDiamondProjectsCsv: vi.fn(),
    exportColoringBooksCsv: vi.fn(),
    exportColoringPagesCsv: vi.fn(),
    exportArchive: vi.fn(),
    importArchive: vi.fn(),
    clearArchiveResult: vi.fn(),
    analyzeFileList: vi.fn(),
    analyzeZipFile: vi.fn(),
    importConfirmed: vi.fn(),
    updateRow: vi.fn(),
    capture: vi.fn(),
    captureException: vi.fn(),
    bulkRows: [] as unknown[],
    bulkLibrary: null as unknown,
    bulkLastResult: null as unknown,
    bulkLoading: false,
    archiveExportResult: null as unknown,
    archiveExportLoading: false,
    archiveExportProgress: 0,
    archiveImportResult: null as unknown,
    importStats: {
      successful: 0,
      failed: 0,
      total: 0,
      errors: [] as string[],
      tagWarnings: [] as string[],
      validationIssues: [] as Array<{
        field: string;
        originalValue: string;
        correctedValue: string;
        severity: string;
        message: string;
      }>,
    },
  },
}));

vi.mock('@/contexts/MetadataContext', () => ({
  useMetadata: () => ({
    isLoading: { companies: false, artists: false, tags: false },
  }),
}));

vi.mock('@/hooks/useProjectImport', () => ({
  useProjectImport: () => ({
    importProjectsFromCSV: mocks.importProjectsFromCSV,
    importDacProjectsFromCSV: mocks.importDacProjectsFromCSV,
    loading: false,
    progress: 0,
    importStats: mocks.importStats,
  }),
}));

vi.mock('@/hooks/useLibraryCsvExport', () => ({
  useLibraryCsvExport: () => ({
    exportDiamondProjectsCsv: mocks.exportDiamondProjectsCsv,
    exportColoringBooksCsv: mocks.exportColoringBooksCsv,
    exportColoringPagesCsv: mocks.exportColoringPagesCsv,
    loadingTarget: null,
  }),
}));

vi.mock('@/hooks/useDataArchiveExport', () => ({
  useDataArchiveExport: () => ({
    exportArchive: mocks.exportArchive,
    loading: mocks.archiveExportLoading,
    progress: mocks.archiveExportProgress,
    lastResult: mocks.archiveExportResult,
  }),
}));

vi.mock('@/hooks/useDataArchiveImport', () => ({
  useDataArchiveImport: () => ({
    importArchive: mocks.importArchive,
    clearResult: mocks.clearArchiveResult,
    loading: false,
    lastResult: mocks.archiveImportResult,
  }),
}));

vi.mock('@/hooks/useBulkPhotoImport', () => ({
  useBulkPhotoImport: () => ({
    analyzeFileList: mocks.analyzeFileList,
    analyzeZipFile: mocks.analyzeZipFile,
    importConfirmed: mocks.importConfirmed,
    updateRow: mocks.updateRow,
    rows: mocks.bulkRows,
    setRows: vi.fn(),
    library: mocks.bulkLibrary,
    loading: mocks.bulkLoading,
    lastResult: mocks.bulkLastResult,
  }),
}));

vi.mock('@/utils/csv/csvTemplateGenerator', () => ({
  downloadCSVTemplate: vi.fn(),
}));

vi.mock('@/services/analytics-escape-hatch', () => ({
  capture: mocks.capture,
  captureException: mocks.captureException,
}));

import { DataImportExportSections } from '../DataImportExportSections';
import { AnalyticsEvent } from '@/services/analytics-events';

function renderDataSections() {
  return render(<DataImportExportSections />);
}

describe('DataImportExportSections', () => {
  beforeEach(() => {
    mocks.importProjectsFromCSV.mockReset();
    mocks.importDacProjectsFromCSV.mockReset();
    mocks.exportDiamondProjectsCsv.mockReset();
    mocks.exportColoringBooksCsv.mockReset();
    mocks.exportColoringPagesCsv.mockReset();
    mocks.exportArchive.mockReset();
    mocks.importArchive.mockReset();
    mocks.analyzeFileList.mockReset();
    mocks.analyzeZipFile.mockReset();
    mocks.importConfirmed.mockReset();
    mocks.updateRow.mockReset();
    mocks.capture.mockReset();
    mocks.captureException.mockReset();
    mocks.bulkRows = [];
    mocks.bulkLibrary = null;
    mocks.bulkLastResult = null;
    mocks.bulkLoading = false;
    mocks.archiveExportResult = null;
    mocks.archiveExportLoading = false;
    mocks.archiveExportProgress = 0;
    mocks.archiveImportResult = null;
    mocks.importStats = {
      successful: 0,
      failed: 0,
      total: 0,
      errors: [] as string[],
      tagWarnings: [] as string[],
      validationIssues: [] as Array<{
        field: string;
        originalValue: string;
        correctedValue: string;
        severity: string;
        message: string;
      }>,
    };
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:photo'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('renders all Data tab sections', () => {
    renderDataSections();

    expect(screen.getAllByRole('heading').map(heading => heading.textContent)).toEqual([
      'Import',
      'Organized Glitter CSV',
      'Diamond Art Club CSV',
      'Photos',
      'Restore archive',
      'Export',
    ]);
  });

  it('keeps the photo result readable without a second live region beside its toast', () => {
    mocks.bulkLastResult = {
      importedCount: 2,
      skippedCount: 1,
      failedCount: 0,
      createdProgressNoteCount: 0,
      overwriteCount: 0,
      errors: [],
    };

    renderDataSections();

    const result = screen.getByRole('group', { name: 'Photo import result' });
    expect(result).toHaveTextContent('2 imported, 1 skipped, 0 failed');
    expect(result.querySelector('[role="status"], [role="alert"], [aria-live]')).toBeNull();
  });

  it('shows archive export and all spreadsheet export buttons with exact labels', () => {
    renderDataSections();

    expect(screen.getByRole('button', { name: 'Export full archive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Diamond projects CSV' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Coloring books CSV' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Coloring pages CSV' })).toBeInTheDocument();
    expect(screen.getByText(/CSV data plus supported photos/i)).toBeInTheDocument();
  });

  it('clicking diamond CSV export calls exportDiamondProjectsCsv', () => {
    renderDataSections();

    fireEvent.click(screen.getByRole('button', { name: 'Diamond projects CSV' }));

    expect(mocks.exportDiamondProjectsCsv).toHaveBeenCalledTimes(1);
  });

  it('clicking coloring book CSV export calls exportColoringBooksCsv', () => {
    renderDataSections();

    fireEvent.click(screen.getByRole('button', { name: 'Coloring books CSV' }));

    expect(mocks.exportColoringBooksCsv).toHaveBeenCalledTimes(1);
  });

  it('clicking coloring page CSV export calls exportColoringPagesCsv', () => {
    renderDataSections();

    fireEvent.click(screen.getByRole('button', { name: 'Coloring pages CSV' }));

    expect(mocks.exportColoringPagesCsv).toHaveBeenCalledTimes(1);
  });

  it('clicking full archive export calls exportArchive', () => {
    renderDataSections();

    fireEvent.click(screen.getByRole('button', { name: 'Export full archive' }));

    expect(mocks.exportArchive).toHaveBeenCalledTimes(1);
  });

  it('shows a parsed DAC preview after upload', async () => {
    renderDataSections();

    const dacInput = screen.getByLabelText('Diamond Art Club CSV file') as HTMLInputElement;
    const file = new File(['Date,Products\n2024-05-10,Starry Fox\n'], 'dac.csv', {
      type: 'text/csv',
    });

    fireEvent.change(dacInput, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('dac.csv')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText(/1 project parsed/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/0 rows skipped/i)).toBeInTheDocument();
    expect(screen.getByText(/First titles:/i)).toBeInTheDocument();
    expect(screen.getByText('Starry Fox')).toBeInTheDocument();
    expect(screen.getByText(/does not include photo files/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'your Orders page' })).toHaveAttribute(
      'href',
      'https://www.diamondartclub.com/pages/orders?view=orders-page'
    );
    expect(mocks.capture).toHaveBeenCalledWith(AnalyticsEvent.DAC_IMPORT_PREVIEWED, {
      surface: 'settings_data',
      source: 'dac_csv',
      status: 'success',
      records: 1,
      skipped: 0,
      warnings: 0,
      file_size_bucket: '1-100kb',
    });
    const payloads = mocks.capture.mock.calls.map(([, properties]) => JSON.stringify(properties));
    expect(payloads.join('\n')).not.toContain('dac.csv');
    expect(payloads.join('\n')).not.toContain('Starry Fox');
  });

  it('keeps Import confirmed photos disabled for an unmatched bulk photo row', () => {
    mocks.bulkRows = [
      {
        id: 'row-1',
        file: new File(['image'], 'unknown.jpg', { type: 'image/jpeg' }),
        path: 'unknown.jpg',
        confidence: 'unmatched',
        reason: 'No matching record found',
        confirmed: false,
        excluded: true,
        overwrite: false,
      },
    ];

    renderDataSections();

    expect(screen.getAllByText('unknown.jpg').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /import confirmed photos/i })).toBeDisabled();
  });

  it('enables Import confirmed photos for a confirmed bulk photo row', () => {
    mocks.bulkRows = [
      {
        id: 'row-1',
        file: new File(['image'], 'cover.jpg', { type: 'image/jpeg' }),
        path: 'cover.jpg',
        targetType: 'project-cover',
        targetId: 'project-1',
        targetLabel: 'Starry Fox',
        confidence: 'high',
        reason: 'Matched project title',
        confirmed: true,
        excluded: false,
        overwrite: false,
      },
    ];

    renderDataSections();

    expect(screen.getByRole('button', { name: /import confirmed photos/i })).toBeEnabled();
  });

  it('clears the selected record and overwrite approval when target kind changes', () => {
    mocks.bulkRows = [
      {
        id: 'row-1',
        file: new File(['image'], 'cover.jpg', { type: 'image/jpeg' }),
        path: 'cover.jpg',
        targetType: 'project-cover',
        targetId: 'shared-id',
        targetLabel: 'Diamond project',
        confidence: 'manifest',
        reason: 'Manifest target reference',
        confirmed: true,
        excluded: false,
        overwrite: true,
      },
    ];
    mocks.bulkLibrary = {
      diamondProjects: [{ id: 'shared-id', title: 'Diamond project', imageUrl: '' }],
      coloringBooks: [{ id: 'shared-id', title: 'Coloring book', coverImage: '' }],
      coloringPages: [],
    };

    renderDataSections();
    fireEvent.change(screen.getAllByRole('combobox', { name: 'Target type' })[0], {
      target: { value: 'coloring-book-cover' },
    });

    expect(mocks.updateRow).toHaveBeenCalledWith(
      'row-1',
      expect.objectContaining({
        targetType: 'coloring-book-cover',
        targetId: undefined,
        targetLabel: undefined,
        confirmed: false,
        excluded: true,
        overwrite: false,
      })
    );
  });

  it('keeps a same-kind target and scopes option lookup to its collection', () => {
    mocks.bulkRows = [
      {
        id: 'row-1',
        file: new File(['image'], 'progress.jpg', { type: 'image/jpeg' }),
        path: 'progress.jpg',
        targetType: 'project-cover',
        targetId: 'shared-id',
        targetLabel: 'Diamond project',
        confidence: 'manifest',
        reason: 'Manifest target reference',
        confirmed: true,
        excluded: false,
        overwrite: false,
      },
    ];
    mocks.bulkLibrary = {
      diamondProjects: [{ id: 'shared-id', title: 'Diamond project', imageUrl: '' }],
      coloringBooks: [{ id: 'shared-id', title: 'Coloring book', coverImage: '' }],
      coloringPages: [],
    };

    renderDataSections();
    fireEvent.change(screen.getAllByRole('combobox', { name: 'Target type' })[0], {
      target: { value: 'project-progress-note' },
    });
    expect(mocks.updateRow).toHaveBeenCalledWith(
      'row-1',
      expect.objectContaining({ targetId: 'shared-id', targetLabel: 'Diamond project' })
    );

    fireEvent.change(screen.getAllByRole('combobox', { name: 'Target record' })[0], {
      target: { value: 'shared-id' },
    });
    expect(mocks.updateRow).toHaveBeenLastCalledWith(
      'row-1',
      expect.objectContaining({ targetId: 'shared-id', targetLabel: 'Diamond project' })
    );
  });

  it('requires a fresh overwrite choice when selecting an existing cover', () => {
    mocks.bulkRows = [
      {
        id: 'row-1',
        file: new File(['image'], 'cover.jpg', { type: 'image/jpeg' }),
        path: 'cover.jpg',
        targetType: 'project-cover',
        confidence: 'unmatched',
        reason: 'No matching record found',
        confirmed: false,
        excluded: true,
        overwrite: false,
      },
    ];
    mocks.bulkLibrary = {
      diamondProjects: [{ id: 'project-1', title: 'Existing cover', imageUrl: 'cover.jpg' }],
      coloringBooks: [],
      coloringPages: [],
    };

    renderDataSections();
    fireEvent.change(screen.getAllByRole('combobox', { name: 'Target record' })[0], {
      target: { value: 'project-1' },
    });

    expect(mocks.updateRow).toHaveBeenCalledWith(
      'row-1',
      expect.objectContaining({
        targetId: 'project-1',
        confirmed: false,
        excluded: true,
        overwrite: false,
        skipReasonCode: 'existing-cover',
      })
    );
  });

  it('shows bulk photo import result counts', () => {
    mocks.bulkLastResult = {
      importedCount: 2,
      skippedCount: 1,
      failedCount: 1,
      createdProgressNoteCount: 3,
      overwriteCount: 1,
      errors: [{ path: 'bad.jpg', message: 'Upload failed' }],
    };

    renderDataSections();

    expect(
      screen.getByText(/2 imported, 1 skipped, 1 failed, 3 progress notes created, 1 overwrite/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/bad.jpg: Upload failed/i)).toBeInTheDocument();
  });

  it('announces in-flight archive export progress to assistive tech', () => {
    mocks.archiveExportLoading = true;
    mocks.archiveExportProgress = 42;

    renderDataSections();

    const status = screen.getByRole('status');
    expect(status.tagName).toBe('OUTPUT');
    expect(status).not.toHaveAttribute('role');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status).toHaveTextContent(/Exporting archive, 42%/i);

    const progressbar = screen.getByRole('progressbar', {
      name: 'Export progress',
    });
    expect(progressbar).toHaveAttribute('aria-valuetext', '42%');
  });

  it('announces in-flight bulk photo import progress to assistive tech', () => {
    mocks.bulkLoading = true;

    renderDataSections();

    const status = screen.getByRole('status');
    expect(status.tagName).toBe('OUTPUT');
    expect(status).not.toHaveAttribute('role');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(screen.getByRole('progressbar', { name: 'Importing photos' })).toBeInTheDocument();
  });

  it('shows archive export warning state', () => {
    mocks.archiveExportResult = {
      success: true,
      filename: 'organized-glitter-export-2026-05-20.zip',
      warningCount: 1,
      warnings: [
        {
          code: 'source-data-warning',
          message: 'Some source data needs attention',
        },
      ],
    };

    renderDataSections();

    expect(screen.getByText('Archive exported with warnings')).toBeInTheDocument();
    expect(screen.getByText('organized-glitter-export-2026-05-20.zip')).toBeInTheDocument();
    expect(screen.getByText(/1 warning occurred/i)).toBeInTheDocument();
    expect(screen.getByText(/Some source data needs attention/i)).toBeInTheDocument();
  });

  it('shows archive import page photo skip counts and warning details', () => {
    mocks.archiveImportResult = {
      success: true,
      createdProjectCount: 0,
      createdColoringBookCount: 1,
      createdProgressNoteCount: 0,
      importedPhotoCount: 0,
      skippedRecordCount: 2,
      skippedPagePhotoCount: 2,
      matchedExistingRecordCount: 1,
      archiveSchemaVersion: 1,
      refMap: {},
      warnings: [
        {
          code: 'skipped-existing-coloring-page-photos',
          message: 'Page 1: skipped 2 of 2 archived photos because this page already has 2 photos',
          recordRef: 'coloring-page:old-page',
        },
      ],
      errors: [],
    };

    renderDataSections();

    expect(screen.getByText(/including 2 archived page photos/i)).toBeInTheDocument();
    expect(screen.getByText('Page photos skipped')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Page 1: skipped 2 of 2 archived photos because this page already has 2 photos'
      )
    ).toBeInTheDocument();
  });

  it('makes every archive import error available', () => {
    const errors = Array.from({ length: 105 }, (_, index) => `Error ${index + 1}`);
    mocks.archiveImportResult = {
      success: false,
      createdProjectCount: 0,
      createdColoringBookCount: 0,
      createdProgressNoteCount: 0,
      importedPhotoCount: 0,
      skippedRecordCount: 0,
      skippedPagePhotoCount: 0,
      matchedExistingRecordCount: 0,
      archiveSchemaVersion: 1,
      refMap: {},
      warnings: [],
      errors,
    };

    renderDataSections();

    expect(screen.getByText('Error 1')).toBeInTheDocument();
    expect(screen.queryByText('Error 5')).not.toBeInTheDocument();
    const details = screen.getByText('View 101 more errors').closest('details');
    expect(details).not.toBeNull();
    details!.open = true;
    fireEvent(details!, new Event('toggle'));
    expect(screen.getByText('Error 104')).toBeInTheDocument();
    expect(screen.queryByText('Error 105')).not.toBeInTheDocument();
    const loadMore = screen.getByRole('button', {
      name: 'Show next 1 errors (1 remaining)',
    });
    loadMore.focus();
    fireEvent.click(loadMore);
    expect(screen.getByText('Error 105')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All errors shown' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'All errors shown' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('resets archive error pagination when a new import result arrives', () => {
    const createResult = (errorCount: number, prefix: string) => ({
      success: false,
      createdProjectCount: 0,
      createdColoringBookCount: 0,
      createdProgressNoteCount: 0,
      importedPhotoCount: 0,
      skippedRecordCount: 0,
      skippedPagePhotoCount: 0,
      matchedExistingRecordCount: 0,
      archiveSchemaVersion: 1,
      refMap: {},
      warnings: [],
      errors: Array.from({ length: errorCount }, (_, index) => `${prefix} ${index + 1}`),
    });
    const firstResult = createResult(304, 'Import error');
    mocks.archiveImportResult = firstResult;
    const { rerender } = renderDataSections();

    const firstDetails = screen.getByText('View 300 more errors').closest('details');
    expect(firstDetails).not.toBeNull();
    firstDetails!.open = true;
    fireEvent(firstDetails!, new Event('toggle'));
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Show next 100 errors (200 remaining)',
      })
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Show next 100 errors (100 remaining)',
      })
    );
    expect(screen.getByRole('button', { name: 'All errors shown' })).toBeInTheDocument();

    rerender(<DataImportExportSections />);
    expect(screen.getByRole('button', { name: 'All errors shown' })).toBeInTheDocument();

    mocks.archiveImportResult = createResult(304, 'Import error');
    rerender(<DataImportExportSections />);

    const secondDetails = screen.getByText('View 300 more errors').closest('details');
    expect(secondDetails).not.toHaveAttribute('open');
    expect(screen.queryByText('Import error 5')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All errors shown' })).not.toBeInTheDocument();

    secondDetails!.open = true;
    fireEvent(secondDetails!, new Event('toggle'));
    expect(screen.getByText('Import error 104')).toBeInTheDocument();
    expect(screen.queryByText('Import error 105')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Show next 100 errors (200 remaining)',
      })
    ).toBeInTheDocument();
  });

  it('does not allow archive import before a ZIP is selected', () => {
    renderDataSections();

    expect(screen.getByRole('button', { name: /^Import archive$/i })).toBeDisabled();

    const archiveInput = screen.getByLabelText('Archive ZIP file') as HTMLInputElement;
    fireEvent.change(archiveInput, {
      target: {
        files: [new File(['zip'], 'backup.zip', { type: 'application/zip' })],
      },
    });

    expect(screen.getByRole('button', { name: /^Import archive$/i })).toBeEnabled();
  });

  it('passes only checked ZIP files to archive import and keeps them selected for retry', () => {
    renderDataSections();
    const first = new File(['one'], 'part-1.zip', { type: 'application/zip' });
    const second = new File(['two'], 'part-2.zip', { type: 'application/zip' });
    fireEvent.change(screen.getByLabelText('Archive ZIP file'), {
      target: { files: [first, second] },
    });
    expect(screen.getByRole('checkbox', { name: 'Select part-1.zip' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select part-2.zip' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select part-1.zip' }));
    fireEvent.click(screen.getByRole('button', { name: /^Import archive$/i }));
    expect(mocks.importArchive).toHaveBeenCalledWith([second]);
    expect(screen.getByRole('checkbox', { name: 'Select part-2.zip' })).toBeChecked();
  });

  it('shows CSV import completion counts from importStats', async () => {
    mocks.importProjectsFromCSV.mockResolvedValue(true);
    mocks.importStats = {
      successful: 3,
      failed: 1,
      total: 4,
      errors: ['Could not import row 4'],
      tagWarnings: ['Tag "too long" was skipped'],
      validationIssues: [
        {
          field: 'status',
          originalValue: 'done',
          correctedValue: 'completed',
          severity: 'warning',
          message: 'Status was normalized',
        },
      ],
    };

    renderDataSections();
    const csvInput = screen.getByLabelText('Organized Glitter CSV file') as HTMLInputElement;
    const file = new File(['title\nStarry Fox\n'], 'organized.csv', {
      type: 'text/csv',
    });

    fireEvent.change(csvInput, {
      target: {
        files: [file],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Import CSV$/i }));

    await waitFor(() => {
      expect(mocks.importProjectsFromCSV).toHaveBeenCalledWith(file);
    });
    expect(
      screen.getByText(/Imported 3, failed 1, validation issues 1, tag warnings 1/i)
    ).toBeInTheDocument();
  });
});
