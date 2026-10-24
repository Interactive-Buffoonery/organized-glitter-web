import { describe, expect, it } from 'vitest';

import type { ColoringPageDTO } from '@/services/pocketbase/coloring.service';
import {
  applyColoringPageOptimisticPatch,
  assertColoringPageLifecycleDateRange,
  buildColoringPagePatch,
  getColoringPageLifecycleDateRangeError,
} from '../coloringProgressCommands';

const page: ColoringPageDTO = {
  id: 'page-1',
  bookId: 'book-1',
  pageNumber: 1,
  status: 'not_started',
  photos: ['main.jpg', 'detail.jpg'],
  mediumIds: [],
  revealedSubject: '',
  revealedAt: '',
  startedAt: '2026-04-10',
  completedAt: '',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

describe('coloring progress commands', () => {
  it('builds PocketBase patches from coloring page commands', () => {
    const file = new File(['after'], 'after.jpg');

    expect(buildColoringPagePatch({ type: 'set-status', status: 'completed' })).toEqual({
      status: 'completed',
    });
    expect(
      buildColoringPagePatch({ type: 'set-completed-date', completedAt: '2026-04-20' })
    ).toEqual({
      completed_at: '2026-04-20',
    });
    expect(buildColoringPagePatch({ type: 'set-completed-date', completedAt: '' })).toEqual({
      completed_at: '',
    });
    expect(
      buildColoringPagePatch({
        type: 'add-photos',
        files: [file],
      })
    ).toEqual({ 'photos+': [file] });
    expect(
      buildColoringPagePatch({
        type: 'delete-photo',
        filename: 'detail.jpg',
      })
    ).toEqual({ 'photos-': ['detail.jpg'] });
    expect(buildColoringPagePatch({ type: 'set-mediums', mediumIds: ['medium-1'] })).toEqual({
      mediums: ['medium-1'],
    });
  });

  it('rejects lifecycle dates where completion is before start', () => {
    expect(
      getColoringPageLifecycleDateRangeError(
        '2026-04-10',
        '2026-04-01',
        'completedAt',
        '2026-10-04'
      )
    ).toBe('Completed date cannot be before started date.');
    expect(
      getColoringPageLifecycleDateRangeError(
        '2026-04-01',
        '2026-04-10',
        'completedAt',
        '2026-10-04'
      )
    ).toBeNull();

    expect(() =>
      assertColoringPageLifecycleDateRange(
        { type: 'set-completed-date', completedAt: '2026-04-01' },
        page,
        '2026-10-04'
      )
    ).toThrow('Completed date cannot be before started date.');

    expect(() =>
      assertColoringPageLifecycleDateRange(
        { type: 'set-started-date', startedAt: '2026-04-20' },
        { ...page, completedAt: '2026-04-18' },
        '2026-10-04'
      )
    ).toThrow('Completed date cannot be before started date.');
  });

  it('maps PocketBase patch fields back onto the cached page shape', () => {
    expect(
      applyColoringPageOptimisticPatch(page, {
        status: 'in_progress',
        mediums: ['medium-1'],
        started_at: '2026-04-12',
        completed_at: '2026-04-20',
        revealed_subject: 'Dragon',
        revealed_at: '2026-04-21T00:00:00.000Z',
      })
    ).toEqual(
      expect.objectContaining({
        status: 'in_progress',
        mediumIds: ['medium-1'],
        startedAt: '2026-04-12',
        completedAt: '2026-04-20',
        revealedSubject: 'Dragon',
        revealedAt: '2026-04-21T00:00:00.000Z',
      })
    );
  });
});
