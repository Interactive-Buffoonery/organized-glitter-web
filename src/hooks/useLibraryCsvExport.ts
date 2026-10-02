import { useCallback, useState } from 'react';

import { notify } from '@/lib/notifications';
import { getCurrentUser, isAuthenticated } from '@/services/auth';
import { AnalyticsEvent } from '@/services/analytics-events';
import {
  captureImportExportEvent,
  captureImportExportException,
  getDurationMs,
} from '@/features/import-export/importExportTelemetry';
import { ColoringService } from '@/services/pocketbase/coloring.service';
import { ColoringMediumsService } from '@/services/pocketbase/coloringMediums.service';
import { ColoringPageProgressNotesService } from '@/services/pocketbase/coloringPageProgressNotes.service';
import { projectsService } from '@/services/pocketbase/projects.service';
import { getCurrentDateInUserTimezone } from '@/utils/date/timezoneUtils';
import {
  buildColoringPageCsvRows,
  coloringBooksToCsv,
  coloringPagesToCsv,
  COLORING_BOOK_METADATA_EXPAND,
  downloadCsv,
  projectsToCsv,
} from '@/utils/csv/csvExport';
import { createLogger } from '@/utils/logger';
import { useUserTimezone } from '@/hooks/useUserTimezone';

const logger = createLogger('useLibraryCsvExport');

export type LibraryCsvExportTarget = 'diamond-projects' | 'coloring-books' | 'coloring-pages';

type ExportResult = {
  success: boolean;
  filename?: string;
  error?: string;
};

type AuthenticatedUser = {
  id: string;
};

type CsvExportPayload = {
  csvData: string;
  filename: string;
  recordCount: number;
  emptyTitle: string;
  emptyDescription: string;
};

function requireAuthenticatedUser(): AuthenticatedUser {
  if (!isAuthenticated()) {
    throw new Error('You must be logged in to export library data');
  }

  const user = getCurrentUser();
  if (!user?.id) {
    throw new Error('You must be logged in to export library data');
  }

  return { id: user.id };
}

export function useLibraryCsvExport() {
  const [loadingTarget, setLoadingTarget] = useState<LibraryCsvExportTarget | null>(null);
  const userTimezone = useUserTimezone();

  const exportCsv = useCallback(
    async (
      target: LibraryCsvExportTarget,
      loadPayload: (user: AuthenticatedUser, dateStamp: string) => Promise<CsvExportPayload>
    ): Promise<ExportResult> => {
      setLoadingTarget(target);
      const startedAt = Date.now();
      try {
        const user = requireAuthenticatedUser();
        const payload = await loadPayload(user, getCurrentDateInUserTimezone(userTimezone));

        if (payload.recordCount === 0) {
          notify({
            kind: 'info',
            title: payload.emptyTitle,
            description: payload.emptyDescription,
          });
          return { success: false, error: payload.emptyTitle };
        }

        downloadCsv(payload.csvData, payload.filename);
        notify({
          kind: 'info',
          title: 'Export complete',
          description: `${payload.recordCount} records exported to ${payload.filename}`,
        });
        captureImportExportEvent(AnalyticsEvent.CSV_EXPORT_COMPLETED, {
          source: 'organized_csv',
          status: 'success',
          records: payload.recordCount,
          duration_ms: getDurationMs(startedAt),
        });

        return { success: true, filename: payload.filename };
      } catch (error) {
        logger.error('CSV export failed', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to export CSV';
        captureImportExportException(error, {
          source: 'csv_export',
          operation: 'export_csv',
          status: 'failed',
          failed_count: 1,
        });
        captureImportExportEvent(AnalyticsEvent.CSV_EXPORT_COMPLETED, {
          source: 'organized_csv',
          status: 'failed',
          errors: 1,
          duration_ms: getDurationMs(startedAt),
        });
        notify({ kind: 'error', title: 'Export failed', description: errorMessage });
        return { success: false, error: errorMessage };
      } finally {
        setLoadingTarget(null);
      }
    },
    [userTimezone]
  );

  const exportDiamondProjectsCsv = useCallback(
    () =>
      exportCsv('diamond-projects', async (user, dateStamp) => {
        const projects = await projectsService.getAllForUser(user.id);
        return {
          csvData: projectsToCsv(projects),
          filename: `diamond-projects-${dateStamp}.csv`,
          recordCount: projects.length,
          emptyTitle: 'No diamond projects found',
          emptyDescription: 'You have no diamond projects to export.',
        };
      }),
    [exportCsv]
  );

  const exportColoringBooksCsv = useCallback(
    () =>
      exportCsv('coloring-books', async (user, dateStamp) => {
        const books = await ColoringService.listAllBooks({
          userId: user.id,
          expand: COLORING_BOOK_METADATA_EXPAND,
        });
        return {
          csvData: coloringBooksToCsv(books),
          filename: `coloring-books-${dateStamp}.csv`,
          recordCount: books.length,
          emptyTitle: 'No coloring books found',
          emptyDescription: 'You have no coloring books to export.',
        };
      }),
    [exportCsv]
  );

  const exportColoringPagesCsv = useCallback(
    () =>
      exportCsv('coloring-pages', async (user, dateStamp) => {
        const books = await ColoringService.listAllBooks({
          userId: user.id,
          expand: COLORING_BOOK_METADATA_EXPAND,
        });
        const [pagesByBookId, mediums, progressNotes] = await Promise.all([
          ColoringService.listAllPagesByBook(
            user.id,
            books.map(book => book.id)
          ),
          ColoringMediumsService.listColoringMediums(user.id),
          ColoringPageProgressNotesService.listAllForUser({
            userId: user.id,
          }),
        ]);
        const rows = buildColoringPageCsvRows({
          books,
          pagesByBookId,
          coloringMediums: mediums.items,
          coloringPageProgressNotes: progressNotes,
        });

        return {
          csvData: coloringPagesToCsv(rows),
          filename: `coloring-pages-${dateStamp}.csv`,
          recordCount: rows.length,
          emptyTitle: 'No coloring pages found',
          emptyDescription: 'You have no coloring pages to export.',
        };
      }),
    [exportCsv]
  );

  return {
    exportDiamondProjectsCsv,
    exportColoringBooksCsv,
    exportColoringPagesCsv,
    loadingTarget,
  };
}
