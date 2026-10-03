import { pb } from '@/lib/pocketbase';
import { Collections } from '@/types/pocketbase.types';
import { createFilter } from '@/services/pocketbase/base/filterBuilder';

interface DiagnosticProjectRecord {
  id: string;
  date_started: string | null;
  created: string;
  updated: string;
}

export interface DiagnosticProjectListResult {
  totalItems: number;
  items: DiagnosticProjectRecord[];
}

export class OverviewDiagnosticsService {
  static async listProjectsForUser(userId: string): Promise<DiagnosticProjectListResult> {
    const firstBatch = await pb
      .collection(Collections.Projects)
      .getList<DiagnosticProjectRecord>(1, 500, {
        filter: createFilter().userScope(userId).build(),
        fields: 'id,date_started,created,updated',
      });

    const items = [...firstBatch.items];

    if (firstBatch.totalItems > 500) {
      const totalPages = Math.ceil(firstBatch.totalItems / 500);

      for (let page = 2; page <= totalPages; page++) {
        const batch = await pb
          .collection(Collections.Projects)
          .getList<DiagnosticProjectRecord>(page, 500, {
            filter: createFilter().userScope(userId).build(),
            fields: 'id,date_started,created,updated',
          });

        items.push(...batch.items);
      }
    }

    return {
      totalItems: firstBatch.totalItems,
      items,
    };
  }

  static async countProjectsStartedAfter(userId: string, date: string): Promise<number> {
    const result = await pb.collection(Collections.Projects).getList(1, 1, {
      filter: createFilter().userScope(userId).greaterThan('date_started', date).build(),
      fields: 'id',
    });

    return result.totalItems;
  }

  static async countProjectsStartedAfterOptimized(userId: string, date: string): Promise<number> {
    const result = await pb.collection(Collections.Projects).getList(1, 1, {
      filter: createFilter()
        .userScope(userId)
        .notEquals('date_started', '')
        .isNotNull('date_started')
        .greaterThan('date_started', date)
        .build(),
      fields: 'id',
    });

    return result.totalItems;
  }
}
