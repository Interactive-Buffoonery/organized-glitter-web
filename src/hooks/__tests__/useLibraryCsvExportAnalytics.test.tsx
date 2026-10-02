import { vi } from 'vitest';
import { act, beforeEach, describe, expect, it, renderHookWithProviders } from '@/test-utils';

const { mockCapture, mockCaptureException, mockDownloadCsv, mockNotify, serviceMocks } = vi.hoisted(
  () => ({
    mockCapture: vi.fn(),
    mockCaptureException: vi.fn(),
    mockDownloadCsv: vi.fn(),
    mockNotify: vi.fn(),
    serviceMocks: {
      auth: {
        isAuthenticated: vi.fn(),
        getCurrentUser: vi.fn(),
      },
      projectsService: {
        getAllForUser: vi.fn(),
      },
      coloringService: {
        listAllBooks: vi.fn(),
        listAllPages: vi.fn(),
        listAllPagesByBook: vi.fn(),
      },
      coloringMediumsService: {
        listColoringMediums: vi.fn(),
      },
      coloringPageProgressNotesService: {
        listAllForUser: vi.fn(),
      },
    },
  })
);

vi.mock('@/services/analytics-escape-hatch', () => ({
  capture: mockCapture,
  captureException: mockCaptureException,
}));

vi.mock('@/lib/notifications', () => ({
  notify: mockNotify,
}));

vi.mock('@/services/auth', () => serviceMocks.auth);

vi.mock('@/services/pocketbase/projects.service', () => ({
  projectsService: serviceMocks.projectsService,
}));

vi.mock('@/hooks/useUserTimezone', () => ({
  useUserTimezone: () => 'America/New_York',
}));

vi.mock('@/utils/csv/csvExport', () => ({
  COLORING_BOOK_METADATA_EXPAND: 'publisher,illustrator,coloring_book_tags_via_book.tag',
  buildColoringPageCsvRows: vi.fn(() => []),
  coloringBooksToCsv: vi.fn(() => 'books'),
  coloringPagesToCsv: vi.fn(() => 'pages'),
  downloadCsv: mockDownloadCsv,
  projectsToCsv: vi.fn(() => 'projects'),
}));

vi.mock('@/services/pocketbase/coloring.service', () => ({
  ColoringService: serviceMocks.coloringService,
}));

vi.mock('@/services/pocketbase/coloringMediums.service', () => ({
  ColoringMediumsService: serviceMocks.coloringMediumsService,
}));

vi.mock('@/services/pocketbase/coloringPageProgressNotes.service', () => ({
  ColoringPageProgressNotesService: serviceMocks.coloringPageProgressNotesService,
}));

const { useLibraryCsvExport } = await import('@/hooks/useLibraryCsvExport');
const { AnalyticsEvent } = await import('@/services/analytics-events');

describe('library CSV export analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.auth.isAuthenticated.mockReturnValue(true);
    serviceMocks.auth.getCurrentUser.mockReturnValue({ id: 'user-1' });
    serviceMocks.projectsService.getAllForUser.mockResolvedValue([
      {
        id: 'project-1',
        userId: 'user-1',
        title: 'Starry Fox',
        status: 'purchased',
        createdAt: '',
        updatedAt: '',
      },
    ]);
  });

  it('captures CSV export completion without the generated filename', async () => {
    const { result } = renderHookWithProviders(() => useLibraryCsvExport());

    await act(async () => {
      await result.current.exportDiamondProjectsCsv();
    });

    expect(mockCapture).toHaveBeenCalledWith(AnalyticsEvent.CSV_EXPORT_COMPLETED, {
      surface: 'settings_data',
      source: 'organized_csv',
      status: 'success',
      records: 1,
      duration_ms: expect.any(Number),
    });
    expect(
      JSON.stringify(mockCapture.mock.calls.map(([, properties]) => properties))
    ).not.toContain('diamond-projects');
  });

  it('does not download a partial coloring page export when the complete page read fails', async () => {
    serviceMocks.coloringService.listAllBooks.mockResolvedValue([{ id: 'book-1' }]);
    serviceMocks.coloringService.listAllPagesByBook.mockRejectedValue(
      Object.assign(
        new Error('Contact support at contact@example.test so we can help you.'),
        {
          type: 'validation',
          retryable: false,
          reason: 'read_limit_exceeded',
        }
      )
    );
    serviceMocks.coloringMediumsService.listColoringMediums.mockResolvedValue({ items: [] });
    serviceMocks.coloringPageProgressNotesService.listAllForUser.mockResolvedValue([]);
    const { result } = renderHookWithProviders(() => useLibraryCsvExport());

    let exportResult;
    await act(async () => {
      exportResult = await result.current.exportColoringPagesCsv();
    });

    expect(exportResult).toEqual({
      success: false,
      error: 'Contact support at contact@example.test so we can help you.',
    });
    expect(mockDownloadCsv).not.toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith({
      kind: 'error',
      title: 'Export failed',
      description: 'Contact support at contact@example.test so we can help you.',
    });
    expect(serviceMocks.coloringService.listAllPages).not.toHaveBeenCalled();
  });
});
