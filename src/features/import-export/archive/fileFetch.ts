import { resolveFileUrl } from '@/lib/pocketbase';
import type { ArchiveFileEntry, ArchiveWarning } from '@/features/import-export/archive/types';

export interface FetchArchiveFileInput {
  collectionName: string;
  recordId: string;
  filename: string;
  entry: ArchiveFileEntry;
  fileToken?: string;
  refreshFileToken?: () => Promise<string>;
}

export interface FetchArchiveFileResult {
  entry: ArchiveFileEntry;
  blob?: Blob;
  warning?: ArchiveWarning;
}

function photoFetchWarning(entry: ArchiveFileEntry, message: string): FetchArchiveFileResult {
  return {
    entry,
    warning: {
      code: 'photo-fetch-failed',
      message,
      path: entry.path,
      recordRef: entry.recordRef,
    },
  };
}

export async function fetchPocketBaseFile(
  input: FetchArchiveFileInput,
  fetchImpl: typeof fetch = fetch
): Promise<FetchArchiveFileResult> {
  try {
    const url = new URL(resolveFileUrl(input.collectionName, input.recordId, input.filename));
    let fileToken = input.fileToken;
    if (fileToken) {
      url.searchParams.set('token', fileToken);
    }

    let response = await fetchImpl(url.toString());
    // PocketBase returns 404 when a protected file token expires because the
    // file request no longer satisfies the collection's View rule.
    const unauthorized =
      response.status === 401 ||
      response.status === 403 ||
      (response.status === 404 && Boolean(fileToken));
    if (unauthorized && input.refreshFileToken) {
      fileToken = await input.refreshFileToken();
      url.searchParams.set('token', fileToken);
      response = await fetchImpl(url.toString());
    }

    if (!response.ok) {
      return photoFetchWarning(input.entry, `Could not fetch ${input.entry.path}`);
    }

    return {
      entry: input.entry,
      blob: await response.blob(),
    };
  } catch (error) {
    return photoFetchWarning(
      input.entry,
      error instanceof Error ? error.message : `Could not fetch ${input.entry.path}`
    );
  }
}
