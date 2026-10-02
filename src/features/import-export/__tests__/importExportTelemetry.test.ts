import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureImportExportException } from '@/features/import-export/importExportTelemetry';

const mockCaptureException = vi.fn();

vi.mock('posthog-js', () => ({
  default: { captureException: (...args: unknown[]) => mockCaptureException(...args) },
}));

describe('import and export exception telemetry', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
  });

  it('never forwards the archive error message or stack to PostHog', () => {
    const error = new Error('Invalid manifest path: private/photos/secret-name.png');
    error.stack = 'Error: private/photos/secret-name.png\n at user@example.com';

    captureImportExportException(error, {
      source: 'archive_import',
      operation: 'read_archive_manifest',
      status: 'failed',
      failed_count: 8,
      archive_schema_version: 2,
    });

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [capturedError, properties] = mockCaptureException.mock.calls[0] as [
      Error,
      Record<string, unknown>,
    ];
    expect(capturedError).not.toBe(error);
    expect(capturedError.name).toBe('ImportExportError');
    expect(capturedError.message).toBe('Import/export operation failed');
    expect(properties).toMatchObject({
      $exception_source: 'archive_import',
      operation: 'read_archive_manifest',
      archive_schema_version: 2,
      status: 'failed',
      failed_count_bucket: '6-20',
      surface: 'settings_data',
      suspected_external_script: false,
    });
    expect(properties).not.toHaveProperty('error_origin');
    expect(`${capturedError.stack} ${JSON.stringify(properties)}`).not.toMatch(
      /secret-name|private\/photos|user@example\.com/
    );
  });

  it.each([
    {
      kind: 'extension stack',
      message: 'Import failed for secret-name.png',
      stack: 'Error: import failed\n at chrome-extension://secret-name/private/file.js:1:1',
    },
    {
      kind: 'cross-origin message',
      message: 'Script error. secret-name.png',
      stack: 'Error: secret-name.png',
    },
  ])('keeps $kind classification without forwarding private error text', ({ message, stack }) => {
    const error = new Error(message);
    error.stack = stack;

    captureImportExportException(error, {
      source: 'archive_import',
      operation: 'read_archive_manifest',
      status: 'failed',
    });

    const [capturedError, properties] = mockCaptureException.mock.calls[0] as [
      Error,
      Record<string, unknown>,
    ];
    expect(properties).toMatchObject({
      suspected_external_script: true,
      error_origin: 'browser_extension_or_external',
    });
    expect(capturedError).not.toBe(error);
    expect(
      `${capturedError.message} ${capturedError.stack} ${JSON.stringify(properties)}`
    ).not.toMatch(/secret-name|chrome-extension:\/\//);
  });

  it('does not serialize thrown object keys or unapproved metadata', () => {
    captureImportExportException(
      { 'private/photos/secret-name.png': 'user@example.com' },
      {
        source: 'archive_export',
        operation: 'load_export_source',
        status: 'failed',
        archive_schema_version: 999,
      }
    );

    const [capturedError, properties] = mockCaptureException.mock.calls[0] as [
      Error,
      Record<string, unknown>,
    ];
    expect(capturedError.name).toBe('ImportExportError');
    expect(properties).not.toHaveProperty('non_error_keys');
    expect(properties).not.toHaveProperty('archive_schema_version');
    expect(`${capturedError.stack} ${JSON.stringify(properties)}`).not.toMatch(
      /secret-name|private\/photos|user@example\.com|999/
    );
  });
});
