import { pb } from '@/lib/pocketbase';
import { Collections } from '@/types/pocketbase.types';
import { pbFilter } from './base/filtering';

export interface ImportTagRecord {
  id: string;
  name: string;
}

export interface CreateImportTagInput {
  userId: string;
  name: string;
  slug: string;
  color: string;
}

export class ImportTagsService {
  static async listUserTags(userId: string): Promise<ImportTagRecord[]> {
    const records = await pb.collection(Collections.Tags).getFullList<ImportTagRecord>({
      filter: pbFilter('user = {:userId}', { userId }),
      fields: 'id,name',
    });

    return records;
  }

  static async slugExists(userId: string, slug: string): Promise<boolean> {
    const existingSlugs = await pb.collection(Collections.Tags).getList(1, 1, {
      filter: pbFilter('user = {:userId} && slug = {:slug}', {
        userId,
        slug,
      }),
      fields: 'id',
    });

    return existingSlugs.items.length > 0;
  }

  static async createTag(data: CreateImportTagInput): Promise<ImportTagRecord> {
    return await pb.collection(Collections.Tags).create<ImportTagRecord>({
      user: data.userId,
      name: data.name,
      slug: data.slug,
      color: data.color,
    });
  }
}
