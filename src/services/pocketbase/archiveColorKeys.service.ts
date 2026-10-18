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

function requireOwner(userId: string, message = 'Your account changed. Reopen this page.') {
  if (!userId || getCurrentUserId() !== userId) throw new Error(message);
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
    requireOwner(userId, 'Sign in again to continue the restore.');
    const result = await pb.send<ArchiveColorKeysRestoreResult>('/api/archive/restore-color-keys', {
      method: 'POST',
      body: { pageId, pageRef, keys, archiveFingerprint },
    });
    requireOwner(userId, 'Sign in again to continue the restore.');
    return result;
  },
};
