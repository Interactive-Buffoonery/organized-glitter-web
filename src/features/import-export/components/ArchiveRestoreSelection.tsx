import * as React from 'react';
import { AlertCircle, Check, FileArchive, UploadCloud, X } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { focusWhenRootInteractive, isRootInert } from '@/utils/focusWhenRootInteractive';

const touchActionClass = 'pointer-coarse:min-h-11';

export interface MultipartRestoreProgress {
  phase: 'preflight' | 'restore';
  completed: number;
  total: number;
  partNumber?: number;
  itemId?: string;
}

export interface MultipartRestoreResult {
  success: boolean;
  selectedPartNumbers: number[];
  missingPartNumbers: number[];
  selectedPartCount: number;
  totalPartCount: number;
  selectedLogicalItemCount: number;
  createdItemCount: number;
  scaffoldedItemCount: number;
  alreadyAppliedItemCount: number;
  restoredAssetCount: number;
  alreadyAppliedAssetCount: number;
  conflicts: ReadonlyArray<{
    partNumber: number;
    itemId: string;
    message: string;
  }>;
  errors: ReadonlyArray<{
    partNumber: number;
    itemId: string;
    message: string;
  }>;
}

export interface MultipartRestorePanelProps {
  files: readonly File[];
  selectedFiles: readonly File[];
  busy?: boolean;
  disabled?: boolean;
  progress?: MultipartRestoreProgress | null;
  error?: string | null;
  result?: MultipartRestoreResult | null;
  onFilesChange: (files: File[]) => void;
  onSelectedFilesChange: (files: File[]) => void;
  onRestore: () => void;
  onCancel?: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function partLabel(partNumber: number): string {
  return `Part ${partNumber}`;
}

function numbersLabel(numbers: readonly number[]): string {
  return numbers.map(number => partLabel(number)).join(', ');
}

function RestoreResult({ result }: { result: MultipartRestoreResult }) {
  const hasIssues = !result.success || result.conflicts.length > 0 || result.errors.length > 0;
  const completeBackup = result.missingPartNumbers.length === 0;
  const title = hasIssues
    ? 'Restore finished with issues'
    : completeBackup
      ? 'Backup restored'
      : 'Selected parts restored';

  return (
    <Alert variant={hasIssues ? 'destructive' : 'default'} aria-live="polite">
      {hasIssues ? <AlertCircle className="size-4" /> : <Check className="size-4" />}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          Processed selected {numbersLabel(result.selectedPartNumbers)} of {result.totalPartCount}{' '}
          backup parts. {result.createdItemCount} new items, {result.scaffoldedItemCount} prepared
          parent items, and {result.restoredAssetCount} assets restored.{' '}
          {result.alreadyAppliedItemCount} items and {result.alreadyAppliedAssetCount} assets were
          already applied.
        </p>
        {completeBackup ? <p>All backup parts were selected.</p> : null}
        {result.missingPartNumbers.length > 0 && (
          <p>
            Missing {numbersLabel(result.missingPartNumbers)}. This restore does not include the
            complete backup.
          </p>
        )}
        {result.conflicts.length > 0 && (
          <p>
            {result.conflicts.length} item conflicts need review:{' '}
            {result.conflicts
              .map(
                conflict => `Part ${conflict.partNumber}, ${conflict.itemId}: ${conflict.message}`
              )
              .join('; ')}
            .
          </p>
        )}
        {result.errors.length > 0 && (
          <p>
            {result.errors.length} items could not be restored:{' '}
            {result.errors
              .map(error => `Part ${error.partNumber}, ${error.itemId}: ${error.message}`)
              .join('; ')}
            .
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function MultipartRestorePanel({
  files,
  selectedFiles,
  busy = false,
  disabled = false,
  progress,
  error,
  result,
  onFilesChange,
  onSelectedFilesChange,
  onRestore,
  onCancel,
}: MultipartRestorePanelProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const errorHeadingRef = React.useRef<HTMLParagraphElement>(null);
  const hadError = React.useRef(Boolean(error));
  const selectedSet = React.useMemo(() => new Set(selectedFiles), [selectedFiles]);

  React.useEffect(() => {
    const shouldFocus = Boolean(error) && (!hadError.current || isRootInert());
    const stopWaiting = shouldFocus ? focusWhenRootInteractive(errorHeadingRef.current) : undefined;
    hadError.current = Boolean(error);
    return stopWaiting;
  }, [error]);

  const toggleFile = (file: File) => {
    const next = selectedSet.has(file)
      ? selectedFiles.filter(candidate => candidate !== file)
      : [...selectedFiles, file];
    onSelectedFilesChange(next);
  };

  const onInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onFilesChange(Array.from(event.target.files ?? []));
    event.target.value = '';
  };

  const progressValue =
    progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="space-y-5">
      <input
        ref={inputRef}
        type="file"
        aria-label="Archive ZIP file"
        accept=".zip,application/zip"
        multiple
        className="sr-only"
        onChange={onInputChange}
        disabled={disabled || busy}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Button
          type="button"
          variant="glass"
          className={touchActionClass}
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
        >
          <FileArchive className="mr-2 size-4" />
          Choose archive ZIP files
        </Button>
        <span className="text-muted-foreground text-sm">
          Select one older archive ZIP, one v3 part for an independent restore, or all v3 parts for
          the complete backup.
        </span>
      </div>

      {files.length > 0 && (
        <fieldset disabled={disabled || busy} className="space-y-2">
          <legend className="text-sm font-medium">Selected files</legend>
          <div className="divide-border/60 border-border/60 divide-y rounded-lg border">
            {files.map(file => {
              const checked = selectedSet.has(file);
              return (
                <label
                  key={`${file.name}-${file.size}-${file.lastModified}`}
                  className="flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2"
                >
                  <input
                    type="checkbox"
                    aria-label={`Select ${file.name}`}
                    checked={checked}
                    onChange={() => toggleFile(file)}
                    className="accent-primary size-4"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{file.name}</span>
                    <span className="text-muted-foreground block text-xs">
                      {formatFileSize(file.size)}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className={touchActionClass}
          onClick={onRestore}
          disabled={disabled || busy || selectedFiles.length === 0}
        >
          <UploadCloud className="mr-2 size-4" />
          Import archive
        </Button>
        {busy && onCancel && (
          <Button type="button" variant="ghost" className={touchActionClass} onClick={onCancel}>
            <X className="mr-2 size-4" />
            Cancel restore
          </Button>
        )}
      </div>

      {busy && progress && (
        <div className="space-y-2" aria-live="polite">
          <Progress
            value={progressValue}
            aria-label="Restore progress"
            aria-valuetext={`${progressValue}%`}
          />
          <output className="text-muted-foreground block text-sm">
            {progress.phase === 'preflight' ? 'Checking archive parts' : 'Restoring archive data'}
            {progress.partNumber ? `, ${partLabel(progress.partNumber)}` : ''} ({progressValue}%)
          </output>
        </div>
      )}
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertCircle className="size-4" />
          <AlertTitle ref={errorHeadingRef} tabIndex={-1}>
            Restore failed
          </AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {result && <RestoreResult result={result} />}
    </div>
  );
}
