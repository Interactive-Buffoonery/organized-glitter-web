import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Download,
  FileArchive,
  FileInput,
  FileSpreadsheet,
  FileText,
  ImagePlus,
  Images,
  Sparkles,
  UploadCloud,
} from 'lucide-react';

import { DataRegionPanel } from '@/components/profile/data-tab/DataRegionPanel';
import { MultipartRestorePanel } from '@/features/import-export/components/ArchiveRestoreSelection';
import { FormatChip } from '@/components/profile/data-tab/FormatChip';
import { ImportSourceCard } from '@/components/profile/data-tab/ImportSourceCard';
import type { ImportStep } from '@/components/profile/data-tab/ImportStepRail';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { useMetadata } from '@/contexts/MetadataContext';
import type {
  ArchiveWarning,
  ArchiveImportResult,
  ArchiveExportResult,
} from '@/features/import-export/archive/types';
import type {
  BulkPhotoImportResult,
  BulkPhotoReviewRow,
  BulkPhotoTargetType,
} from '@/features/import-export/bulk-photos/types';
import {
  kindForTargetType,
  targetTypesByKind,
} from '@/features/import-export/bulk-photos/targetKinds';
import { parseDacCsvFile, type DacCsvPreview } from '@/features/import-export/csv/dacImport';
import { useBulkPhotoImport } from '@/hooks/useBulkPhotoImport';
import { useDataArchiveExport } from '@/hooks/useDataArchiveExport';
import { useDataArchiveImport } from '@/hooks/useDataArchiveImport';
import { useLibraryCsvExport, type LibraryCsvExportTarget } from '@/hooks/useLibraryCsvExport';
import { useProjectImport } from '@/hooks/useProjectImport';
import { AnalyticsEvent } from '@/services/analytics-events';
import {
  bucketFileSize,
  captureImportExportEvent,
  captureImportExportException,
  getImportExportStatus,
} from '@/features/import-export/importExportTelemetry';
import { downloadCSVTemplate } from '@/utils/csv/csvTemplateGenerator';

const targetTypeLabels: Record<BulkPhotoTargetType, string> = {
  'project-cover': 'Diamond project cover',
  'project-progress-note': 'Diamond progress note',
  'coloring-book-cover': 'Coloring book cover',
  'coloring-page-photo': 'Coloring page gallery photo',
  'coloring-page-progress-note': 'Coloring page progress note',
};

const touchActionClass = 'pointer-coarse:h-11';

type FileInputKind = 'organizedCsv' | 'dacCsv' | 'bulkZip' | 'bulkFolder';
type ProjectImportMode = 'organized-csv' | 'dac';
type ProjectImportStats = ReturnType<typeof useProjectImport>['importStats'];
type BulkPhotoImportState = ReturnType<typeof useBulkPhotoImport>;

interface BulkTargetOption {
  id: string;
  label: string;
  types: readonly BulkPhotoTargetType[];
  hasCover: boolean;
}

interface DataImportExportState {
  organizedCsvFile: File | null;
  dacCsvFile: File | null;
  dacPreview: DacCsvPreview | null;
  archiveFiles: File[];
  selectedArchiveFiles: File[];
  projectImportResultMode: ProjectImportMode | null;
}

interface DataImportExportSectionsProps {
  disabled?: boolean;
}

function formatFileSize(size: number): string {
  return size > 1024 * 1024
    ? `${(size / (1024 * 1024)).toFixed(2)} MB`
    : `${(size / 1024).toFixed(2)} KB`;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function isImportableBulkRow(row: BulkPhotoReviewRow): boolean {
  return Boolean(row.confirmed && !row.excluded && row.targetId && row.targetType);
}

function archiveWarningKey(warning: ArchiveWarning): string {
  return [warning.code, warning.path, warning.recordRef, warning.message].filter(Boolean).join(':');
}

function PhotoThumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  return <img src={url} alt="" className="bg-muted size-14 rounded-md object-cover" />;
}

function SelectedFileSummary({ file, label = 'Selected' }: { file: File; label?: string }) {
  return (
    <div className="border-border bg-muted rounded-lg border p-3 text-sm">
      <p className="font-medium">{file.name}</p>
      <p className="text-muted-foreground mt-1">
        {label} file, {formatFileSize(file.size)}
      </p>
    </div>
  );
}

function CountGrid({ items }: { items: Array<{ label: string; value: number | string }> }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(item => (
        <div key={item.label} className="border-border bg-muted rounded-lg border p-3">
          <dt className="text-muted-foreground text-xs">{item.label}</dt>
          <dd className="mt-1 text-lg font-semibold">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ArchiveResultAlert({ result }: { result: ArchiveExportResult }) {
  const hasWarnings = result.warningCount > 0;

  if (!result.success) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertTitle>Archive export failed</AlertTitle>
        <AlertDescription>{result.error ?? 'The archive could not be exported.'}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      {hasWarnings ? <AlertCircle className="size-4" /> : <Check className="size-4" />}
      <AlertTitle>{hasWarnings ? 'Archive exported with warnings' : 'Archive exported'}</AlertTitle>
      <AlertDescription className="space-y-3">
        {result.filename && <p>{result.filename}</p>}
        {hasWarnings && (
          <p>{pluralize(result.warningCount, 'warning')} occurred. Review the details below.</p>
        )}
        {result.warnings.length > 0 && (
          <details className="text-muted-foreground">
            <summary className="text-foreground cursor-pointer font-medium">
              Warning details
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {result.warnings.map(warning => (
                <li key={archiveWarningKey(warning)}>
                  {warning.message}
                  {warning.path ? ` (${warning.path})` : ''}
                </li>
              ))}
            </ul>
          </details>
        )}
      </AlertDescription>
    </Alert>
  );
}

function ArchiveImportResultAlert({ result }: { result: ArchiveImportResult }) {
  const [instance, setInstance] = useState({ result, version: 0 });

  if (instance.result !== result) {
    setInstance({ result, version: instance.version + 1 });
  }

  return <ArchiveImportResultContent key={instance.version} result={result} />;
}

function ArchiveImportResultContent({ result }: { result: ArchiveImportResult }) {
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [visibleErrorCount, setVisibleErrorCount] = useState(100);
  const hiddenErrorCount = Math.max(result.errors.length - 4 - visibleErrorCount, 0);
  const pagePhotoSkipSummary =
    result.skippedPagePhotoCount > 0
      ? `, including ${result.skippedPagePhotoCount} archived page photo${
          result.skippedPagePhotoCount === 1 ? '' : 's'
        }`
      : '';

  return (
    <Alert
      variant={result.success ? 'default' : 'destructive'}
      role="group"
      aria-label="Archive import result"
    >
      {result.success ? <Check className="size-4" /> : <AlertCircle className="size-4" />}
      <AlertTitle>
        {result.success ? 'Archive import summary' : 'Archive import completed with errors'}
      </AlertTitle>
      <AlertDescription className="space-y-4">
        <p>
          {result.createdProjectCount} diamond projects, {result.createdColoringBookCount} coloring
          books, {result.createdProgressNoteCount} progress notes, and {result.importedPhotoCount}{' '}
          photos imported. {result.matchedExistingRecordCount} existing records matched,{' '}
          {result.skippedRecordCount} records skipped{pagePhotoSkipSummary},{' '}
          {result.warnings.length} warnings, {result.errors.length} errors.
        </p>
        <CountGrid
          items={[
            {
              label: 'Diamond projects created',
              value: result.createdProjectCount,
            },
            {
              label: 'Coloring books created',
              value: result.createdColoringBookCount,
            },
            {
              label: 'Progress notes created',
              value: result.createdProgressNoteCount,
            },
            { label: 'Photos imported', value: result.importedPhotoCount },
            {
              label: 'Existing records matched',
              value: result.matchedExistingRecordCount,
            },
            { label: 'Records skipped', value: result.skippedRecordCount },
            {
              label: 'Page photos skipped',
              value: result.skippedPagePhotoCount,
            },
            { label: 'Warnings', value: result.warnings.length },
            { label: 'Errors', value: result.errors.length },
          ]}
        />
        {!result.success && result.errors.length > 0 && (
          <div>
            <p className="font-medium">{result.errors.length > 4 ? 'First errors' : 'Errors'}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {result.errors.slice(0, 4).map((error, index) => (
                <li key={`${index}-${error}`}>{error}</li>
              ))}
            </ul>
            {result.errors.length > 4 && (
              <details
                className="text-muted-foreground mt-2"
                onToggle={event => setShowAllErrors(event.currentTarget.open)}
              >
                <summary className="text-foreground inline-flex min-h-11 cursor-pointer items-center font-medium">
                  View {result.errors.length - 4} more errors
                </summary>
                {showAllErrors && (
                  <div>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {result.errors.slice(4, 4 + visibleErrorCount).map((error, index) => (
                        <li key={`${index + 4}-${error}`}>{error}</li>
                      ))}
                    </ul>
                    {result.errors.length > 104 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3 min-h-11"
                        aria-disabled={hiddenErrorCount === 0}
                        onClick={() => {
                          if (hiddenErrorCount > 0) {
                            setVisibleErrorCount(count => count + 100);
                          }
                        }}
                      >
                        {hiddenErrorCount > 0
                          ? `Show next ${Math.min(100, hiddenErrorCount)} errors (${hiddenErrorCount} remaining)`
                          : 'All errors shown'}
                      </Button>
                    )}
                  </div>
                )}
              </details>
            )}
          </div>
        )}
        {result.warnings.length > 0 && (
          <details className="text-muted-foreground">
            <summary className="text-foreground cursor-pointer font-medium">
              Warning details
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {result.warnings.slice(0, 5).map(warning => (
                <li key={archiveWarningKey(warning)}>
                  {warning.message}
                  {warning.path ? ` (${warning.path})` : ''}
                </li>
              ))}
            </ul>
          </details>
        )}
      </AlertDescription>
    </Alert>
  );
}

function CsvImportResultAlert({
  importStats,
  title = 'CSV import complete',
}: {
  importStats: ProjectImportStats;
  title?: string;
}) {
  const issueCount = importStats.validationIssues.length;
  const tagWarningCount = importStats.tagWarnings.length;
  const hasErrors = importStats.failed > 0 || importStats.errors.length > 0;
  const hasWarnings = issueCount > 0 || tagWarningCount > 0;
  let resultTitle = title;
  if (hasErrors) {
    resultTitle = 'CSV import completed with issues';
  } else if (hasWarnings) {
    resultTitle = `${title} with notes`;
  }

  return (
    <Alert
      variant={hasErrors && importStats.successful === 0 ? 'destructive' : 'default'}
      role="group"
      aria-label="CSV import result"
    >
      {hasErrors || hasWarnings ? <AlertCircle className="size-4" /> : <Check className="size-4" />}
      <AlertTitle>{resultTitle}</AlertTitle>
      <AlertDescription className="space-y-4">
        <p>
          Imported {importStats.successful}, failed {importStats.failed}, validation issues{' '}
          {issueCount}, tag warnings {tagWarningCount}
          {importStats.skipped ? `, skipped ${importStats.skipped}` : ''}.
        </p>
        <CountGrid
          items={[
            { label: 'Imported', value: importStats.successful },
            { label: 'Failed', value: importStats.failed },
            ...(importStats.skipped ? [{ label: 'Skipped', value: importStats.skipped }] : []),
            { label: 'Validation issues', value: issueCount },
            { label: 'Tag warnings', value: tagWarningCount },
          ]}
        />
        {(importStats.errors.length > 0 ||
          importStats.tagWarnings.length > 0 ||
          importStats.validationIssues.length > 0) && (
          <div className="space-y-3">
            {importStats.errors.length > 0 && (
              <div>
                <p className="font-medium">First errors</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {importStats.errors.slice(0, 4).map(error => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
            {importStats.validationIssues.length > 0 && (
              <div>
                <p className="font-medium">Validation notes</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {importStats.validationIssues.slice(0, 4).map(issue => (
                    <li
                      key={`${issue.field}-${issue.originalValue}-${issue.correctedValue ?? ''}-${issue.message}`}
                    >
                      {issue.field}: {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {importStats.tagWarnings.length > 0 && (
              <div>
                <p className="font-medium">Tag warnings</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {importStats.tagWarnings.slice(0, 4).map(warning => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}

function DacPreviewPanel({ preview }: { preview: DacCsvPreview }) {
  const hasProjects = preview.projectCount > 0;
  const hasWarnings = preview.warnings.length > 0;

  return (
    <Alert variant={!hasProjects && hasWarnings ? 'destructive' : 'default'}>
      {!hasProjects && hasWarnings ? (
        <AlertCircle className="size-4" />
      ) : (
        <FileText className="size-4" />
      )}
      <AlertTitle>{hasProjects ? 'DAC preview ready' : 'DAC preview needs attention'}</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          {pluralize(preview.projectCount, 'project')} parsed,{' '}
          {pluralize(preview.skippedRowCount, 'row')} skipped,{' '}
          {pluralize(preview.duplicateProjectCount, 'duplicate')} found,{' '}
          {pluralize(preview.warnings.length, 'warning')}.
        </p>
        <CountGrid
          items={[
            { label: 'Projects parsed', value: preview.projectCount },
            { label: 'Rows skipped', value: preview.skippedRowCount },
            { label: 'Duplicates found', value: preview.duplicateProjectCount },
            { label: 'Warnings', value: preview.warnings.length },
          ]}
        />
        {preview.firstTitles.length > 0 && (
          <p>
            First titles: <span className="font-medium">{preview.firstTitles.join(', ')}</span>
          </p>
        )}
        <p className="text-muted-foreground">{preview.note}</p>
        {preview.warnings.length > 0 && (
          <ul className="list-disc space-y-1 pl-5">
            {preview.warnings.slice(0, 4).map(warning => (
              <li key={`${warning.row}-${warning.message}`}>
                Row {warning.row}: {warning.message}
              </li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  );
}

function BulkPhotoSummary({ rows }: { rows: BulkPhotoReviewRow[] }) {
  const includedCount = rows.filter(isImportableBulkRow).length;
  const unmatchedCount = rows.filter(row => row.confidence === 'unmatched').length;
  const coverOverwriteBlockedCount = rows.filter(
    row => row.skipReasonCode === 'existing-cover'
  ).length;
  const skippedCount = rows.length - includedCount;

  return (
    <CountGrid
      items={[
        { label: 'Total images', value: rows.length },
        { label: 'Included', value: includedCount },
        { label: 'Skipped', value: skippedCount },
        { label: 'Unmatched', value: unmatchedCount },
        { label: 'Cover overwrite blocked', value: coverOverwriteBlockedCount },
      ]}
    />
  );
}

function BulkPhotoResultPanel({ result }: { result: BulkPhotoImportResult }) {
  return (
    <Alert
      variant={result.failedCount > 0 ? 'destructive' : 'default'}
      role="group"
      aria-label="Photo import result"
    >
      {result.failedCount > 0 ? <AlertCircle className="size-4" /> : <Check className="size-4" />}
      <AlertTitle>Bulk photo result</AlertTitle>
      <AlertDescription className="space-y-4">
        <p>
          {result.importedCount} imported, {result.skippedCount} skipped, {result.failedCount}{' '}
          failed, {result.createdProgressNoteCount} progress notes created,{' '}
          {pluralize(result.overwriteCount, 'overwrite')}.
        </p>
        <CountGrid
          items={[
            { label: 'Imported', value: result.importedCount },
            { label: 'Skipped', value: result.skippedCount },
            { label: 'Failed', value: result.failedCount },
            {
              label: 'Progress notes created',
              value: result.createdProgressNoteCount,
            },
            { label: 'Overwrites', value: result.overwriteCount },
          ]}
        />
        {result.errors.length > 0 && (
          <div>
            <p className="font-medium">First errors</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {result.errors.slice(0, 4).map(error => (
                <li key={`${error.path}-${error.message}`}>
                  {error.path}: {error.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}

function BulkPhotoReviewFields({
  row,
  targetOptions,
  updateBulkRow,
  idPrefix,
}: {
  row: BulkPhotoReviewRow;
  targetOptions: BulkTargetOption[];
  updateBulkRow: (row: BulkPhotoReviewRow, patch: Partial<BulkPhotoReviewRow>) => void;
  idPrefix: string;
}) {
  const targetTypeId = `${idPrefix}-target-type`;
  const targetRecordId = `${idPrefix}-target-record`;
  const includeId = `${idPrefix}-include`;
  const targetRecordOptions = targetOptions.reduce<React.ReactNode[]>((options, option) => {
    if (!row.targetType || !option.types.includes(row.targetType)) {
      return options;
    }

    options.push(
      <option key={option.id} value={option.id}>
        {option.label}
      </option>
    );
    return options;
  }, []);

  return (
    <>
      <div className="space-y-1">
        <label htmlFor={targetTypeId} className="text-sm font-medium">
          Target type
        </label>
        <select
          id={targetTypeId}
          className="border-input bg-background h-11 w-full rounded-md border px-3 text-sm"
          value={row.targetType ?? ''}
          onChange={event => {
            const targetType = event.target.value
              ? (event.target.value as BulkPhotoTargetType)
              : undefined;
            const sameKind =
              targetType &&
              row.targetType &&
              kindForTargetType(targetType) === kindForTargetType(row.targetType);
            const option = sameKind
              ? targetOptions.find(
                  item => item.id === row.targetId && item.types.includes(targetType)
                )
              : undefined;
            const coverBlocked = Boolean(option?.hasCover && targetType?.endsWith('-cover'));
            updateBulkRow(row, {
              targetType,
              targetId: option?.id,
              targetLabel: option?.label,
              confirmed: Boolean(option && !coverBlocked),
              excluded: !option || coverBlocked,
              overwrite: false,
              skipReasonCode: coverBlocked ? 'existing-cover' : undefined,
              skipReason: coverBlocked
                ? 'Existing cover will not be overwritten unless you opt in.'
                : undefined,
            });
          }}
        >
          <option value="">Unmatched</option>
          {Object.entries(targetTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor={targetRecordId} className="text-sm font-medium">
          Target record
        </label>
        <select
          id={targetRecordId}
          className="border-input bg-background h-11 w-full rounded-md border px-3 text-sm"
          value={row.targetId ?? ''}
          disabled={!row.targetType}
          onChange={event => {
            const targetId = event.target.value;
            const option = targetOptions.find(
              item => item.id === targetId && row.targetType && item.types.includes(row.targetType)
            );
            const coverBlocked = Boolean(option?.hasCover && row.targetType?.endsWith('-cover'));
            updateBulkRow(row, {
              targetId: option?.id,
              targetLabel: option?.label,
              confirmed: Boolean(option && !coverBlocked),
              excluded: !option || coverBlocked,
              overwrite: false,
              skipReasonCode: coverBlocked ? 'existing-cover' : undefined,
              skipReason: coverBlocked
                ? 'Existing cover will not be overwritten unless you opt in.'
                : undefined,
            });
          }}
        >
          <option value="">Choose target</option>
          {targetRecordOptions}
        </select>
      </div>
      <label htmlFor={includeId} className="flex min-h-11 items-center gap-3 text-sm font-medium">
        <Checkbox
          id={includeId}
          checked={row.confirmed && !row.excluded}
          onCheckedChange={checked =>
            updateBulkRow(row, {
              confirmed: checked === true,
              excluded: checked !== true,
            })
          }
          aria-label={`Include ${row.file.name}`}
        />
        Include
      </label>
    </>
  );
}

function BulkPhotoReviewTableRow({
  row,
  targetOptions,
  updateBulkRow,
}: {
  row: BulkPhotoReviewRow;
  targetOptions: BulkTargetOption[];
  updateBulkRow: (row: BulkPhotoReviewRow, patch: Partial<BulkPhotoReviewRow>) => void;
}) {
  return (
    <tr className="border-border border-t align-top">
      <td className="p-3">
        <div className="flex items-start gap-3">
          <PhotoThumbnail file={row.file} />
          <div>
            <p className="font-medium">{row.file.name}</p>
            <p className="text-muted-foreground max-w-[240px] truncate text-xs">{row.reason}</p>
            {row.skipReason && (
              <p className="text-muted-foreground mt-1 text-xs">{row.skipReason}</p>
            )}
          </div>
        </div>
      </td>
      <td className="p-3">
        <div className="w-56 space-y-2">
          <BulkPhotoReviewFields
            row={row}
            targetOptions={targetOptions}
            updateBulkRow={updateBulkRow}
            idPrefix={`bulk-table-${row.id}`}
          />
        </div>
      </td>
      <td className="p-3 capitalize">{row.confidence}</td>
      <td className="p-3">
        <span className="text-muted-foreground text-xs">
          {isImportableBulkRow(row) ? 'Included' : 'Skipped'}
        </span>
      </td>
    </tr>
  );
}

function BulkPhotoReviewCards({
  rows,
  targetOptions,
  updateBulkRow,
}: {
  rows: BulkPhotoReviewRow[];
  targetOptions: BulkTargetOption[];
  updateBulkRow: (row: BulkPhotoReviewRow, patch: Partial<BulkPhotoReviewRow>) => void;
}) {
  return (
    <div className="space-y-3 md:hidden">
      {rows.map(row => (
        <article key={row.id} className="border-border bg-muted rounded-lg border p-3">
          <div className="flex gap-3">
            <PhotoThumbnail file={row.file} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{row.file.name}</p>
              <p className="text-muted-foreground mt-1 text-xs capitalize">
                {row.confidence === 'unmatched' ? 'Unmatched' : `${row.confidence} confidence`}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">{row.reason}</p>
              {row.skipReason && (
                <p className="text-muted-foreground mt-1 text-sm">{row.skipReason}</p>
              )}
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <BulkPhotoReviewFields
              row={row}
              targetOptions={targetOptions}
              updateBulkRow={updateBulkRow}
              idPrefix={`bulk-card-${row.id}`}
            />
          </div>
        </article>
      ))}
    </div>
  );
}

function BulkPhotoReviewTableDesktop({
  rows,
  targetOptions,
  updateBulkRow,
}: {
  rows: BulkPhotoReviewRow[];
  targetOptions: BulkTargetOption[];
  updateBulkRow: (row: BulkPhotoReviewRow, patch: Partial<BulkPhotoReviewRow>) => void;
}) {
  return (
    <div className="border-border hidden overflow-x-auto rounded-lg border md:block">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th className="p-3 text-left font-medium">File</th>
            <th className="p-3 text-left font-medium">Review</th>
            <th className="p-3 text-left font-medium">Confidence</th>
            <th className="p-3 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <BulkPhotoReviewTableRow
              key={row.id}
              row={row}
              targetOptions={targetOptions}
              updateBulkRow={updateBulkRow}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExportTask({
  csvLoadingTarget,
  archiveExportLoading,
  archiveExportProgress,
  archiveExportResult,
  disabled,
  onExportDiamondProjectsCsv,
  onExportColoringBooksCsv,
  onExportColoringPagesCsv,
  onExportArchive,
}: {
  csvLoadingTarget: LibraryCsvExportTarget | null;
  archiveExportLoading: boolean;
  archiveExportProgress: number;
  archiveExportResult: ArchiveExportResult | null;
  disabled?: boolean;
  onExportDiamondProjectsCsv: () => void;
  onExportColoringBooksCsv: () => void;
  onExportColoringPagesCsv: () => void;
  onExportArchive: () => void;
}) {
  const csvExportLoading = csvLoadingTarget !== null;

  return (
    <div className="space-y-6">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Button
            type="button"
            size="lg"
            className={touchActionClass}
            onClick={onExportArchive}
            disabled={disabled || archiveExportLoading}
          >
            <FileArchive className="mr-2 size-4" />
            Export full archive
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <FormatChip>.zip</FormatChip>
            <FormatChip>.csv</FormatChip>
            <span className="text-muted-foreground text-xs">
              CSV data plus supported photos for diamond projects, progress notes, coloring books,
              and coloring pages.
            </span>
          </div>
        </div>

        <div className="border-border/50 space-y-3 border-t pt-4">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
            Or export spreadsheet data only
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              variant="glass"
              className={touchActionClass}
              onClick={onExportDiamondProjectsCsv}
              disabled={disabled || csvExportLoading}
            >
              <Download className="mr-2 size-4" />
              Diamond projects CSV
            </Button>
            <Button
              type="button"
              variant="glass"
              className={touchActionClass}
              onClick={onExportColoringBooksCsv}
              disabled={disabled || csvExportLoading}
            >
              <Download className="mr-2 size-4" />
              Coloring books CSV
            </Button>
            <Button
              type="button"
              variant="glass"
              className={touchActionClass}
              onClick={onExportColoringPagesCsv}
              disabled={disabled || csvExportLoading}
            >
              <Download className="mr-2 size-4" />
              Coloring pages CSV
            </Button>
          </div>
        </div>
      </div>

      {archiveExportLoading && (
        <div className="space-y-2">
          <Progress
            value={archiveExportProgress}
            className="h-2"
            aria-label="Export progress"
            aria-valuetext={`${archiveExportProgress}%`}
          />
          <output
            className="text-muted-foreground block text-sm"
            aria-live="polite"
            aria-atomic="true"
          >
            Exporting archive, {archiveExportProgress}%
          </output>
        </div>
      )}

      {archiveExportResult && <ArchiveResultAlert result={archiveExportResult} />}
    </div>
  );
}

function ProjectDataTask({
  organizedCsvInputRef,
  organizedCsvFile,
  importBusy,
  disabled,
  projectImportLoading,
  projectImportProgress,
  importStats,
  showProjectImportResult,
  onOrganizedCsvChange,
  onSelectOrganizedCsv,
  onOrganizedCsvImport,
}: {
  organizedCsvInputRef: React.RefObject<HTMLInputElement | null>;
  organizedCsvFile: File | null;
  importBusy: boolean;
  disabled?: boolean;
  projectImportLoading: boolean;
  projectImportProgress: number;
  importStats: ProjectImportStats;
  showProjectImportResult: boolean;
  onOrganizedCsvChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSelectOrganizedCsv: () => void;
  onOrganizedCsvImport: () => void;
}) {
  return (
    <>
      <input
        ref={organizedCsvInputRef}
        aria-label="Organized Glitter CSV file"
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={onOrganizedCsvChange}
      />

      <details className="group border-border/50 open:bg-muted/30 -mx-2 rounded-md px-2 py-1.5 [&_summary::-webkit-details-marker]:hidden">
        <summary className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1.5 text-xs font-medium tracking-wide uppercase select-none">
          <span className="transition-transform group-open:rotate-90" aria-hidden>
            ▸
          </span>
          Template workflow
        </summary>
        <ol className="text-muted-foreground mt-2 list-decimal space-y-1 pl-7 text-sm">
          <li>Download the CSV template.</li>
          <li>Fill in one diamond project per row.</li>
          <li>Select the completed CSV and import it here.</li>
          <li>Use Import photos later if you want to attach cover or progress images.</li>
        </ol>
      </details>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button
          type="button"
          variant="glass"
          className={touchActionClass}
          onClick={downloadCSVTemplate}
          disabled={disabled}
        >
          <FileText className="mr-2 size-4" />
          Download template
        </Button>
        <Button
          type="button"
          variant="glass"
          className={touchActionClass}
          onClick={onSelectOrganizedCsv}
          disabled={importBusy}
        >
          <UploadCloud className="mr-2 size-4" />
          Select completed CSV
        </Button>
        <Button
          type="button"
          className={touchActionClass}
          onClick={onOrganizedCsvImport}
          disabled={!organizedCsvFile || importBusy}
        >
          <FileInput className="mr-2 size-4" />
          Import CSV
        </Button>
      </div>
      {organizedCsvFile && <SelectedFileSummary file={organizedCsvFile} />}

      {projectImportLoading && (
        <div className="space-y-2">
          <Progress
            value={projectImportProgress}
            className="h-2"
            aria-label="Import progress"
            aria-valuetext={`${projectImportProgress}%`}
          />
          <output
            className="text-muted-foreground block space-y-1"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="block text-sm">Working, {projectImportProgress}%</span>
            {importStats.currentProject && (
              <span className="block text-xs italic">
                Currently importing: {importStats.currentProject}
              </span>
            )}
          </output>
        </div>
      )}

      {showProjectImportResult && (
        <CsvImportResultAlert importStats={importStats} title="CSV import complete" />
      )}
    </>
  );
}

function DacImportTask({
  dacCsvInputRef,
  dacCsvFile,
  dacPreview,
  importBusy,
  projectImportLoading,
  projectImportProgress,
  importStats,
  showDacImportResult,
  onDacCsvChange,
  onSelectDacCsv,
  onDacImport,
}: {
  dacCsvInputRef: React.RefObject<HTMLInputElement | null>;
  dacCsvFile: File | null;
  dacPreview: DacCsvPreview | null;
  importBusy: boolean;
  projectImportLoading: boolean;
  projectImportProgress: number;
  importStats: ProjectImportStats;
  showDacImportResult: boolean;
  onDacCsvChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSelectDacCsv: () => void;
  onDacImport: () => void;
}) {
  return (
    <>
      <input
        ref={dacCsvInputRef}
        aria-label="Diamond Art Club CSV file"
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={onDacCsvChange}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button
          type="button"
          variant="glass"
          className={touchActionClass}
          onClick={onSelectDacCsv}
          disabled={importBusy}
        >
          <UploadCloud className="mr-2 size-4" />
          Select DAC CSV
        </Button>
        <Button
          type="button"
          className={touchActionClass}
          onClick={onDacImport}
          disabled={!dacPreview || dacPreview.projectCount === 0 || importBusy}
        >
          <FileInput className="mr-2 size-4" />
          Import DAC projects
        </Button>
      </div>

      {dacCsvFile && <SelectedFileSummary file={dacCsvFile} label="Selected DAC CSV" />}
      {dacPreview && <DacPreviewPanel preview={dacPreview} />}

      {projectImportLoading && (
        <div className="space-y-2">
          <Progress
            value={projectImportProgress}
            className="h-2"
            aria-label="Import progress"
            aria-valuetext={`${projectImportProgress}%`}
          />
          <output
            className="text-muted-foreground block space-y-1"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="block text-sm">Working, {projectImportProgress}%</span>
            {importStats.currentProject && (
              <span className="block text-xs italic">
                Currently importing: {importStats.currentProject}
              </span>
            )}
          </output>
        </div>
      )}

      {showDacImportResult && (
        <CsvImportResultAlert importStats={importStats} title="DAC import complete" />
      )}
    </>
  );
}

function PhotoImportTask({
  bulkZipInputRef,
  bulkFolderInputRef,
  bulkPhotoImport,
  targetOptions,
  projectImportLoading,
  archiveImportLoading,
  hasConfirmedBulkRows,
  disabled,
  onBulkZipChange,
  onBulkFolderChange,
  onSelectBulkZip,
  onSelectBulkFolder,
  onConfirmOverwriteCovers,
  updateBulkRow,
}: {
  bulkZipInputRef: React.RefObject<HTMLInputElement | null>;
  bulkFolderInputRef: React.RefObject<HTMLInputElement | null>;
  bulkPhotoImport: BulkPhotoImportState;
  targetOptions: BulkTargetOption[];
  projectImportLoading: boolean;
  archiveImportLoading: boolean;
  hasConfirmedBulkRows: boolean;
  disabled?: boolean;
  onBulkZipChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBulkFolderChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSelectBulkZip: () => void;
  onSelectBulkFolder: () => void;
  onConfirmOverwriteCovers: () => void;
  updateBulkRow: (row: BulkPhotoReviewRow, patch: Partial<BulkPhotoReviewRow>) => void;
}) {
  return (
    <>
      <input
        ref={bulkZipInputRef}
        aria-label="Bulk photo ZIP file"
        type="file"
        accept=".zip,application/zip"
        className="sr-only"
        onChange={onBulkZipChange}
      />
      <input
        ref={bulkFolderInputRef}
        aria-label="Bulk photo folder"
        type="file"
        className="sr-only"
        multiple
        onChange={onBulkFolderChange}
        {...{ webkitdirectory: '' }}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button
          type="button"
          variant="glass"
          className={touchActionClass}
          onClick={onSelectBulkZip}
          disabled={disabled || bulkPhotoImport.loading}
        >
          <FileArchive className="mr-2 size-4" />
          Select photo ZIP
        </Button>
        <Button
          type="button"
          variant="glass"
          className={touchActionClass}
          onClick={onSelectBulkFolder}
          disabled={disabled || bulkPhotoImport.loading}
        >
          <ImagePlus className="mr-2 size-4" />
          Select folder
        </Button>
        <Button
          type="button"
          className={touchActionClass}
          onClick={bulkPhotoImport.importConfirmed}
          disabled={disabled || !hasConfirmedBulkRows || bulkPhotoImport.loading}
        >
          <UploadCloud className="mr-2 size-4" />
          Import confirmed photos
        </Button>
      </div>

      {bulkPhotoImport.loading && !projectImportLoading && !archiveImportLoading && (
        <div className="space-y-2">
          <Progress
            value={35}
            className="h-2"
            aria-label="Importing photos"
            aria-valuetext="Working"
          />
          <output
            className="text-muted-foreground block text-sm"
            aria-live="polite"
            aria-atomic="true"
          >
            Working
          </output>
        </div>
      )}

      {bulkPhotoImport.rows.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <p className="text-sm font-medium">
              {pluralize(bulkPhotoImport.rows.length, 'photo')} ready for review
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={touchActionClass}
              onClick={onConfirmOverwriteCovers}
            >
              Allow existing cover overwrites
            </Button>
          </div>
          <BulkPhotoSummary rows={bulkPhotoImport.rows} />
          <BulkPhotoReviewTableDesktop
            rows={bulkPhotoImport.rows}
            targetOptions={targetOptions}
            updateBulkRow={updateBulkRow}
          />
          <BulkPhotoReviewCards
            rows={bulkPhotoImport.rows}
            targetOptions={targetOptions}
            updateBulkRow={updateBulkRow}
          />
        </div>
      )}

      {bulkPhotoImport.lastResult && <BulkPhotoResultPanel result={bulkPhotoImport.lastResult} />}
    </>
  );
}

export function DataImportExportSections({ disabled = false }: DataImportExportSectionsProps) {
  const { isLoading } = useMetadata();
  const metadataLoading = isLoading.companies || isLoading.artists || isLoading.tags;
  const {
    importProjectsFromCSV,
    importDacProjectsFromCSV,
    loading: projectImportLoading,
    progress: projectImportProgress,
    importStats,
  } = useProjectImport();
  const {
    exportDiamondProjectsCsv,
    exportColoringBooksCsv,
    exportColoringPagesCsv,
    loadingTarget: csvLoadingTarget,
  } = useLibraryCsvExport();
  const {
    exportArchive,
    loading: archiveExportLoading,
    progress: archiveExportProgress,
    lastResult: archiveExportResult,
  } = useDataArchiveExport();
  const {
    importArchive,
    loading: archiveImportLoading,
    lastResult: archiveImportResult,
    v3Result: archiveV3Result,
    progress: archiveImportProgress,
    error: archiveImportError,
    cancelImport: cancelArchiveImport,
    clearResult: clearArchiveImportResult,
  } = useDataArchiveImport();
  const bulkPhotoImport = useBulkPhotoImport();

  const [pageState, setPageState] = useState<DataImportExportState>({
    organizedCsvFile: null,
    dacCsvFile: null,
    dacPreview: null,
    archiveFiles: [],
    selectedArchiveFiles: [],
    projectImportResultMode: null,
  });
  const {
    organizedCsvFile,
    dacCsvFile,
    dacPreview,
    archiveFiles,
    selectedArchiveFiles,
    projectImportResultMode,
  } = pageState;

  const patchPageState = (patch: Partial<DataImportExportState>) => {
    setPageState(prev => ({ ...prev, ...patch }));
  };

  const inputRefs = {
    organizedCsv: useRef<HTMLInputElement | null>(null),
    dacCsv: useRef<HTMLInputElement | null>(null),
    bulkZip: useRef<HTMLInputElement | null>(null),
    bulkFolder: useRef<HTMLInputElement | null>(null),
  } satisfies Record<FileInputKind, React.RefObject<HTMLInputElement | null>>;

  const targetOptions = useMemo(() => {
    if (!bulkPhotoImport.library) return [];
    const projectOptions = bulkPhotoImport.library.diamondProjects.map(project => ({
      id: project.id,
      label: project.title,
      types: targetTypesByKind.project,
      hasCover: Boolean(project.imageUrl),
    }));
    const bookOptions = bulkPhotoImport.library.coloringBooks.map(book => ({
      id: book.id,
      label: book.title,
      types: targetTypesByKind['coloring-book'],
      hasCover: Boolean(book.coverImage),
    }));
    const pageOptions = bulkPhotoImport.library.coloringPages.map(page => ({
      id: page.id,
      label: `${page.bookTitle ?? 'Coloring book'}, page ${page.pageNumber}`,
      types: targetTypesByKind['coloring-page'],
      hasCover: false,
    }));
    return [...projectOptions, ...bookOptions, ...pageOptions];
  }, [bulkPhotoImport.library]);

  const selectFile = (kind: FileInputKind) => inputRefs[kind].current?.click();

  const handleOrganizedCsvChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    patchPageState({
      organizedCsvFile: event.target.files?.[0] ?? null,
      projectImportResultMode: null,
    });
  };

  const handleDacCsvChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    patchPageState({
      dacCsvFile: file,
      dacPreview: null,
      projectImportResultMode: null,
    });
    if (!file) return;
    try {
      const preview = await parseDacCsvFile(file);
      patchPageState({ dacPreview: preview });
      captureImportExportEvent(AnalyticsEvent.DAC_IMPORT_PREVIEWED, {
        source: 'dac_csv',
        status: getImportExportStatus({
          success: preview.projectCount > 0,
          records: preview.projectCount,
          warnings: preview.warnings.length,
        }),
        records: preview.projectCount,
        skipped: preview.skippedRowCount,
        warnings: preview.warnings.length,
        file_size_bucket: bucketFileSize(file.size),
      });
    } catch (error) {
      captureImportExportException(error, {
        source: 'dac_import',
        operation: 'preview_dac_csv',
        status: 'failed',
        failed_count: 1,
      });
      captureImportExportEvent(AnalyticsEvent.DAC_IMPORT_PREVIEWED, {
        source: 'dac_csv',
        status: 'failed',
        records: 0,
        errors: 1,
        file_size_bucket: bucketFileSize(file.size),
      });
      patchPageState({
        dacPreview: {
          source: 'diamond-art-club',
          projectCount: 0,
          skippedRowCount: 0,
          duplicateProjectCount: 0,
          firstTitles: [],
          warnings: [
            {
              row: 1,
              message: error instanceof Error ? error.message : 'Could not parse DAC CSV',
            },
          ],
          projects: [],
          note: 'Diamond Art Club CSV does not include photo files.',
        },
      });
    }
  };

  const handleOrganizedCsvImport = async () => {
    if (!organizedCsvFile) return;
    patchPageState({ projectImportResultMode: 'organized-csv' });
    const success = await importProjectsFromCSV(organizedCsvFile);
    if (success) {
      patchPageState({ organizedCsvFile: null });
      if (inputRefs.organizedCsv.current) inputRefs.organizedCsv.current.value = '';
    }
  };

  const handleDacImport = async () => {
    if (!dacCsvFile || !dacPreview || dacPreview.projectCount === 0) return;
    patchPageState({ projectImportResultMode: 'dac' });
    const success = await importDacProjectsFromCSV(dacCsvFile);
    if (success) {
      patchPageState({ dacCsvFile: null, dacPreview: null });
      if (inputRefs.dacCsv.current) inputRefs.dacCsv.current.value = '';
    }
  };

  const handleBulkZipChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) await bulkPhotoImport.analyzeZipFile(file);
  };

  const handleBulkFolderChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files?.length) await bulkPhotoImport.analyzeFileList(files);
  };

  const updateBulkRow = (row: BulkPhotoReviewRow, patch: Partial<BulkPhotoReviewRow>) => {
    bulkPhotoImport.updateRow(row.id, patch);
  };

  const confirmOverwriteCovers = () => {
    bulkPhotoImport.rows.forEach(row => {
      if (row.skipReasonCode === 'existing-cover' && row.targetType && row.targetId) {
        updateBulkRow(row, {
          confirmed: true,
          excluded: false,
          overwrite: true,
          skipReasonCode: undefined,
          skipReason: undefined,
        });
      }
    });
  };

  const hasConfirmedBulkRows = bulkPhotoImport.rows.some(isImportableBulkRow);
  const importBusy = disabled || projectImportLoading || metadataLoading;
  const hasProjectImportResult =
    importStats.total > 0 ||
    importStats.successful > 0 ||
    importStats.failed > 0 ||
    importStats.errors.length > 0 ||
    importStats.tagWarnings.length > 0 ||
    importStats.validationIssues.length > 0;
  const showOrganizedCsvImportResult =
    projectImportResultMode === 'organized-csv' && hasProjectImportResult;
  const showDacImportResult = projectImportResultMode === 'dac' && hasProjectImportResult;

  const organizedCsvStep: ImportStep = showOrganizedCsvImportResult
    ? 3
    : projectImportLoading && projectImportResultMode === 'organized-csv'
      ? 3
      : organizedCsvFile
        ? 2
        : 1;

  const dacCsvStep: ImportStep = showDacImportResult
    ? 3
    : projectImportLoading && projectImportResultMode === 'dac'
      ? 3
      : dacPreview
        ? 2
        : 1;

  const photoStep: ImportStep = bulkPhotoImport.lastResult
    ? 3
    : bulkPhotoImport.loading
      ? 3
      : bulkPhotoImport.rows.length > 0
        ? 2
        : 1;

  return (
    <div className="space-y-6">
      <DataRegionPanel
        direction="in"
        title="Import"
        description="Bring projects and photos into Organized Glitter."
        aria-busy={disabled}
      >
        <ImportSourceCard
          icon={FileSpreadsheet}
          title="Organized Glitter CSV"
          description="Download the CSV template, fill in your diamond project rows, then import the completed file. While you can't import photos as part of the spreadsheet, you can attach them after you import your projects with the photo import option below."
          formats={<FormatChip>.csv</FormatChip>}
          step={organizedCsvStep}
        >
          <ProjectDataTask
            organizedCsvInputRef={inputRefs.organizedCsv}
            organizedCsvFile={organizedCsvFile}
            importBusy={importBusy}
            disabled={disabled}
            projectImportLoading={
              projectImportLoading && projectImportResultMode === 'organized-csv'
            }
            projectImportProgress={projectImportProgress}
            importStats={importStats}
            showProjectImportResult={showOrganizedCsvImportResult}
            onOrganizedCsvChange={handleOrganizedCsvChange}
            onSelectOrganizedCsv={() => selectFile('organizedCsv')}
            onOrganizedCsvImport={handleOrganizedCsvImport}
          />
        </ImportSourceCard>

        <ImportSourceCard
          icon={Sparkles}
          title="Diamond Art Club CSV"
          description={
            <>
              Import Diamond Art Club order exports as purchased diamond projects. To get the CSV,
              log into your Diamond Art Club account and go to{' '}
              <a
                href="https://www.diamondartclub.com/pages/orders?view=orders-page"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                your Orders page
              </a>
              . DAC order CSVs do not include photos, but cover and progress images can be attached
              afterwards by uploading them below.
            </>
          }
          formats={<FormatChip>.csv</FormatChip>}
          step={dacCsvStep}
        >
          <DacImportTask
            dacCsvInputRef={inputRefs.dacCsv}
            dacCsvFile={dacCsvFile}
            dacPreview={dacPreview}
            importBusy={importBusy}
            projectImportLoading={projectImportLoading && projectImportResultMode === 'dac'}
            projectImportProgress={projectImportProgress}
            importStats={importStats}
            showDacImportResult={showDacImportResult}
            onDacCsvChange={handleDacCsvChange}
            onSelectDacCsv={() => selectFile('dacCsv')}
            onDacImport={handleDacImport}
          />
        </ImportSourceCard>

        <ImportSourceCard
          icon={Images}
          title="Photos"
          description="Upload a ZIP file or folder of images, review matches to your existing projects, and then import photos. You can import them as both project and progress note photos."
          formats={
            <>
              <FormatChip>.zip</FormatChip>
              <FormatChip>folder</FormatChip>
            </>
          }
          step={photoStep}
        >
          <PhotoImportTask
            bulkZipInputRef={inputRefs.bulkZip}
            bulkFolderInputRef={inputRefs.bulkFolder}
            bulkPhotoImport={bulkPhotoImport}
            targetOptions={targetOptions}
            projectImportLoading={projectImportLoading}
            archiveImportLoading={archiveImportLoading}
            hasConfirmedBulkRows={hasConfirmedBulkRows}
            disabled={disabled}
            onBulkZipChange={handleBulkZipChange}
            onBulkFolderChange={handleBulkFolderChange}
            onSelectBulkZip={() => selectFile('bulkZip')}
            onSelectBulkFolder={() => selectFile('bulkFolder')}
            onConfirmOverwriteCovers={confirmOverwriteCovers}
            updateBulkRow={updateBulkRow}
          />
        </ImportSourceCard>
      </DataRegionPanel>

      <DataRegionPanel
        direction="restore"
        title="Restore archive"
        description="Restore from an archive ZIP. Creates new records in this account, skips duplicates where it can match them."
        aria-busy={disabled}
      >
        <MultipartRestorePanel
          files={archiveFiles}
          selectedFiles={selectedArchiveFiles}
          busy={archiveImportLoading}
          disabled={disabled}
          progress={archiveImportProgress}
          error={archiveImportError}
          result={archiveV3Result}
          onFilesChange={files => {
            patchPageState({
              archiveFiles: files,
              selectedArchiveFiles: files,
            });
            clearArchiveImportResult();
          }}
          onSelectedFilesChange={files => {
            patchPageState({ selectedArchiveFiles: files });
            clearArchiveImportResult();
          }}
          onRestore={() => {
            void importArchive(selectedArchiveFiles);
          }}
          onCancel={cancelArchiveImport}
        />
        {archiveImportResult && <ArchiveImportResultAlert result={archiveImportResult} />}
      </DataRegionPanel>

      <DataRegionPanel
        direction="out"
        title="Export"
        description="Take your data with you."
        aria-busy={disabled}
      >
        <ExportTask
          csvLoadingTarget={csvLoadingTarget}
          archiveExportLoading={archiveExportLoading}
          archiveExportProgress={archiveExportProgress}
          archiveExportResult={archiveExportResult}
          disabled={disabled}
          onExportDiamondProjectsCsv={exportDiamondProjectsCsv}
          onExportColoringBooksCsv={exportColoringBooksCsv}
          onExportColoringPagesCsv={exportColoringPagesCsv}
          onExportArchive={exportArchive}
        />
      </DataRegionPanel>
    </div>
  );
}
