import { pb } from '@/lib/pocketbase';
import type { ColoringPageMetadataSnapshot } from '@/features/import-export/archive/archiveImportRecovery';
import type { ColoringPageDTO } from '@/services/pocketbase/coloring.service';

export interface RestoreArchiveColoringPageMetadataInput {
  pageId: string;
  baseline: ColoringPageMetadataSnapshot;
  intended: ColoringPageMetadataSnapshot;
}

export interface RestoreArchiveColoringBookBatchResult {
  bookId: string;
  created: boolean;
  pages: ColoringPageDTO[];
}

export interface RestoreArchiveDiamondProjectResult {
  id: string;
  status: string;
}

export const ArchiveFilesService = {
  getPrivateFileToken(): Promise<string> {
    return pb.files.getToken();
  },

  async restoreColoringPageMetadata(input: RestoreArchiveColoringPageMetadataInput): Promise<void> {
    await pb.send('/api/archive/restore-coloring-page-metadata', {
      method: 'POST',
      body: input,
    });
  },

  restoreDiamondProject(formData: FormData): Promise<RestoreArchiveDiamondProjectResult> {
    return pb.send('/api/archive/restore-diamond-project', {
      method: 'POST',
      body: formData,
    });
  },

  restoreColoringBookBatch(formData: FormData): Promise<RestoreArchiveColoringBookBatchResult> {
    return pb.send('/api/archive/restore-coloring-book', {
      method: 'POST',
      body: formData,
    });
  },

  async reconcileColoringBookMetrics(bookId: string): Promise<void> {
    await pb.send('/api/archive/reconcile-coloring-book-metrics', {
      method: 'POST',
      body: { bookId },
    });
  },
};
