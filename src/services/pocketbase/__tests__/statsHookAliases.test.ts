import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('stats PocketBase hook aliases', () => {
  const statsHookSource = readFileSync(join(process.cwd(), 'pb_hooks/stats.pb.js'), 'utf8');

  it('uses camelCase SQL aliases for DynamicModel-backed stats fields', () => {
    const expectedAliases = [
      'AS totalKits',
      'AS completedThisYear',
      'AS allTimeCompleted',
      'AS averageCompletionDays',
      'AS averageCompletionCount',
      'AS averageStashDwellDays',
      'AS averageStashDwellCount',
      'AS averageTimeToStartDays',
      'AS averageTimeToStartCount',
      'AS dateStarted',
      'AS dateCompleted',
      'AS projectId',
      'AS projectTitle',
      'AS hasImage',
      'AS totalBooks',
      'AS completedPagesThisYear',
      'AS allTimeCompletedPages',
      'AS averagePageCompletionDays',
      'AS averagePageCompletionCount',
      'AS averageBookDwellDays',
      'AS averageBookDwellCount',
      'AS bookId',
      'AS bookTitle',
      'AS pageNumber',
      'AS startedAt',
      'AS completedAt',
      'AS completionPercentage',
    ];

    for (const alias of expectedAliases) {
      expect(statsHookSource).toContain(alias);
    }
  });

  it('does not use the snake_case aliases that DynamicModel does not read', () => {
    const staleAliases = [
      'AS total_kits',
      'AS completed_this_year',
      'AS all_time_completed',
      'AS average_completion_days',
      'AS average_completion_count',
      'AS average_stash_dwell_days',
      'AS average_stash_dwell_count',
      'AS average_time_to_start_days',
      'AS average_time_to_start_count',
      'AS date_started',
      'AS date_completed',
      'AS project_id',
      'AS project_title',
      'AS has_image',
      'AS total_books',
      'AS completed_pages_this_year',
      'AS all_time_completed_pages',
      'AS average_page_completion_days',
      'AS average_page_completion_count',
      'AS average_book_dwell_days',
      'AS average_book_dwell_count',
      'AS book_id',
      'AS book_title',
      'AS page_number',
      'AS started_at',
      'AS completed_at',
      'AS completion_percentage',
    ];

    for (const alias of staleAliases) {
      expect(statsHookSource).not.toContain(alias);
    }
  });
});

describe('coloring PocketBase hook aliases', () => {
  const coloringHookSource = readFileSync(join(process.cwd(), 'pb_hooks/coloring.pb.js'), 'utf8');

  it('uses camelCase aliases for DynamicModel-backed book rollups', () => {
    expect(coloringHookSource).toContain('AS totalPages');
    expect(coloringHookSource).toContain('AS completedPages');
  });

  it('does not use snake_case aliases for DynamicModel-backed book rollups', () => {
    expect(coloringHookSource).not.toContain('AS total_pages');
    expect(coloringHookSource).not.toContain('AS completed_pages');
  });
});
