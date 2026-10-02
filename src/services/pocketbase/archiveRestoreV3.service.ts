import { pb } from '@/lib/pocketbase';

import {
  ARCHIVE_FILE_ROLES,
  type ArchiveItemV3,
  type ArchiveFileRole,
} from '@/features/import-export/archive/v3/types';

export interface ArchiveRestoreCapabilities {
  restoreSchemaVersions: number[];
  multipartRestore: boolean;
  maxPartBytes: number;
  maxAssetBytesByRole: Record<ArchiveFileRole, number>;
  maxRestoreRequestChars: number;
  maxMetadataStringChars: number;
  maxMetadataListEntries: number;
  maxMetadataListEntryChars: number;
  maxMetadataNumber: number;
  maxAssetPosition: number;
  receiptVersion: number;
}

export interface RestoreArchiveItemRequest {
  backupId: string;
  partNumber: number;
  partCount: number;
  inventoryDigest: string;
  item: ArchiveItemV3;
}

export interface RestoreArchiveItemResponse {
  outcome: 'created' | 'already_applied';
  itemId: string;
  targetRecordId: string;
  scaffoldedParentCount: number;
  assetOutcomes: Array<{
    assetId: string;
    outcome: 'created' | 'already_applied';
  }>;
}

export interface RestoreArchiveItemInput {
  request: RestoreArchiveItemRequest;
  assets: ReadonlyMap<string, Blob>;
  signal?: AbortSignal;
}

class ServerUpdateRequiredError extends Error {
  readonly reason = 'server_update_required';

  constructor() {
    super('This server must be updated before multipart backups can be restored.');
    this.name = 'ServerUpdateRequiredError';
  }
}

function parseArchiveRestoreCapabilities(value: unknown): ArchiveRestoreCapabilities {
  const candidate = value as Partial<ArchiveRestoreCapabilities> | null;
  if (
    !candidate ||
    !Array.isArray(candidate.restoreSchemaVersions) ||
    !candidate.restoreSchemaVersions.includes(3) ||
    candidate.multipartRestore !== true ||
    candidate.receiptVersion !== 1 ||
    !Number.isSafeInteger(candidate.maxPartBytes) ||
    candidate.maxPartBytes! <= 0 ||
    !candidate.maxAssetBytesByRole ||
    ARCHIVE_FILE_ROLES.some(
      role =>
        !Number.isSafeInteger(candidate.maxAssetBytesByRole?.[role]) ||
        candidate.maxAssetBytesByRole![role] <= 0
    ) ||
    ![
      'maxRestoreRequestChars',
      'maxMetadataStringChars',
      'maxMetadataListEntries',
      'maxMetadataListEntryChars',
      'maxMetadataNumber',
      'maxAssetPosition',
    ].every(
      key =>
        Number.isSafeInteger(candidate[key as keyof ArchiveRestoreCapabilities]) &&
        (candidate[key as keyof ArchiveRestoreCapabilities] as number) > 0
    )
  ) {
    throw new ServerUpdateRequiredError();
  }
  return candidate as ArchiveRestoreCapabilities;
}

export const ArchiveRestoreV3Service = {
  async getCapabilities(signal?: AbortSignal): Promise<ArchiveRestoreCapabilities> {
    try {
      const response = await pb.send<ArchiveRestoreCapabilities>('/api/archive/capabilities', {
        method: 'GET',
        signal,
        requestKey: null,
      });
      return parseArchiveRestoreCapabilities(response);
    } catch (error) {
      if (signal?.aborted) throw error;
      if (
        (error as { status?: number })?.status !== 404 &&
        !(error instanceof ServerUpdateRequiredError)
      )
        throw error;
      throw new ServerUpdateRequiredError();
    }
  },

  restoreItem(input: RestoreArchiveItemInput): Promise<RestoreArchiveItemResponse> {
    const formData = new FormData();
    formData.append('request', JSON.stringify(input.request));
    for (const descriptor of input.request.item.assets) {
      const asset = input.assets.get(descriptor.assetId);
      if (!asset) throw new Error(`Prepared archive asset is missing: ${descriptor.assetId}`);
      formData.append(
        `asset:${descriptor.assetId}`,
        asset,
        descriptor.originalFilename ?? descriptor.path.split('/').at(-1) ?? descriptor.assetId
      );
    }
    return pb.send<RestoreArchiveItemResponse>('/api/archive/v3/restore-item', {
      method: 'POST',
      body: formData,
      signal: input.signal,
      requestKey: null,
    });
  },
};
