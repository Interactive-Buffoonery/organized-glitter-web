import { pb } from '@/lib/pocketbase';
import { getCurrentUserId } from '@/services/auth';
import type {
  ArchiveColorKey,
  ArchiveColorKeyMetadata,
} from '@/features/import-export/archive/types';

export interface ArchiveColorKeyRecord extends ArchiveColorKeyMetadata {
  id: string;
  page: string;
  user: string;
}

export interface ArchiveColorKeysRestoreResult {
  outcome: 'created' | 'already_applied' | 'skipped';
  refMap: Partial<Record<ArchiveColorKey['ref'], string>>;
}

export class ArchiveRestoreSignInError extends Error {
  constructor() {
    super('Sign in again to continue the restore.');
    this.name = 'ArchiveRestoreSignInError';
  }
}

function requireOwner(userId: string) {
  if (!userId || getCurrentUserId() !== userId)
    throw new Error('Your account changed. Reopen this page.');
}

export const ArchiveColorKeysService = {
  async list(userId: string): Promise<ArchiveColorKeyRecord[]> {
    requireOwner(userId);
    const rows = await pb
      .collection('coloring_page_color_keys')
      .getFullList<ArchiveColorKeyRecord>({
        filter: pb.filter('user = {:user}', { user: userId }),
        sort: 'page,position,created,id',
      });
    requireOwner(userId);
    return rows;
  },
  async restore(
    pageId: string,
    userId: string,
    pageRef: string,
    keys: ArchiveColorKey[],
    archiveFingerprint: string
  ): Promise<ArchiveColorKeysRestoreResult> {
    if (!userId || getCurrentUserId() !== userId) throw new ArchiveRestoreSignInError();
    const result = await pb.send<ArchiveColorKeysRestoreResult>('/api/archive/restore-color-keys', {
      method: 'POST',
      body: { pageId, pageRef, keys, archiveFingerprint },
    });
    return result;
  },
};
