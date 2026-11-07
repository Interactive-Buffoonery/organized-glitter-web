import React, { useEffect, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import type { BulkPhotoReviewRow, BulkPhotoTargetType } from '../bulk-photos/types';
import { kindForTargetType } from '../bulk-photos/targetKinds';
import { isImportableBulkRow } from '../bulk-photos/reviewRows';

export interface BulkTargetOption {
  id: string;
  label: string;
  types: readonly BulkPhotoTargetType[];
  hasCover: boolean;
}

const targetTypeLabels: Record<BulkPhotoTargetType, string> = {
  'project-cover': 'Diamond project cover',
  'project-progress-note': 'Diamond progress note',
  'coloring-book-cover': 'Coloring book cover',
  'coloring-page-photo': 'Coloring page gallery photo',
  'coloring-page-progress-note': 'Coloring page progress note',
};

function PhotoThumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  return <img src={url} alt="" className="bg-muted size-14 rounded-md object-cover" />;
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

export function BulkPhotoReviewCards({
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

export function BulkPhotoReviewTableDesktop({
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
