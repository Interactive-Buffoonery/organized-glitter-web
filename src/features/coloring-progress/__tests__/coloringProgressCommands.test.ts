import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ColoringPageDTO } from '@/services/pocketbase/coloring.service';
import {
  applyColoringPageOptimisticPatch,
  assertColoringPageLifecycleDateRange,
  buildColoringPagePatch,
  getColoringPageLifecycleDateRangeError,
  getColoringPageCommandEffects,
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
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it('rejects main-photo commands owned by the dedicated route', () => {
    const dedicatedRouteCommand = {
      type: 'set-main-photo',
      filename: 'detail.jpg',
    } as const;

    expect(() =>
      // Simulate an untyped caller bypassing the compile-time command boundary.
      buildColoringPagePatch(dedicatedRouteCommand as never)
    ).toThrow('Set-main-photo commands must use the dedicated main-photo route.');
  });

  it('carries the caller-supplied reveal timestamp into the update patch', () => {
    expect(
      buildColoringPagePatch({
        type: 'reveal-mystery',
        revealedSubject: 'Dragon',
        revealedAt: '2026-05-17T16:20:00.000Z',
      })
    ).toEqual({
      revealed_subject: 'Dragon',
      revealed_at: '2026-05-17T16:20:00.000Z',
    });
  });

  it('builds an empty reveal patch when marking a mystery page unrevealed', () => {
    expect(buildColoringPagePatch({ type: 'clear-mystery-reveal' })).toEqual({
      revealed_subject: '',
      revealed_at: '',
    });
  });

  it('rejects lifecycle dates where completion is before start', () => {
    expect(getColoringPageLifecycleDateRangeError('2026-04-10', '2026-04-01')).toBe(
      'Completed date cannot be before started date.'
    );
    expect(getColoringPageLifecycleDateRangeError('2026-04-01', '2026-04-10')).toBeNull();

    expect(() =>
      assertColoringPageLifecycleDateRange(
        { type: 'set-completed-date', completedAt: '2026-04-01' },
        page
      )
    ).toThrow('Completed date cannot be before started date.');

    expect(() =>
      assertColoringPageLifecycleDateRange(
        { type: 'set-started-date', startedAt: '2026-04-20' },
        { ...page, completedAt: '2026-04-18' }
      )
    ).toThrow('Completed date cannot be before started date.');
  });

  it('classifies cache and analytics effects per command', () => {
    expect(getColoringPageCommandEffects({ type: 'set-status', status: 'completed' })).toEqual(
      expect.objectContaining({
        shouldOptimisticallyUpdateDetail: true,
        shouldRefreshPageDetail: true,
        shouldRefreshPageLists: true,
        shouldRefreshBookProgress: true,
        shouldTrackStatusChange: true,
      })
    );
    expect(getColoringPageCommandEffects({ type: 'set-mediums', mediumIds: ['medium-1'] })).toEqual(
      expect.objectContaining({
        shouldOptimisticallyUpdateDetail: true,
        shouldRefreshBookProgress: false,
        shouldTrackStatusChange: false,
      })
    );
    expect(
      getColoringPageCommandEffects({
        type: 'add-photos',
        files: [new File(['after'], 'after.jpg')],
      })
    ).toEqual(
      expect.objectContaining({
        shouldOptimisticallyUpdateDetail: false,
        shouldTrackPhotoDelta: true,
      })
    );
    expect(
      getColoringPageCommandEffects({
        type: 'reveal-mystery',
        revealedSubject: 'Dragon',
        revealedAt: '2026-05-17T16:20:00.000Z',
      })
    ).toEqual(
      expect.objectContaining({
        shouldOptimisticallyUpdateDetail: false,
        shouldTrackMysteryReveal: true,
      })
    );
    expect(getColoringPageCommandEffects({ type: 'clear-mystery-reveal' })).toEqual(
      expect.objectContaining({
        shouldRefreshPageDetail: true,
        shouldRefreshPageLists: true,
        shouldTrackMysteryReveal: false,
      })
    );
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

  it('maps an empty reveal patch back onto the cached page shape', () => {
    expect(
      applyColoringPageOptimisticPatch(
        {
          ...page,
          revealedSubject: 'Dragon',
          revealedAt: '2026-04-21T00:00:00.000Z',
        },
        {
          revealed_subject: '',
          revealed_at: '',
        }
      )
    ).toEqual(
      expect.objectContaining({
        revealedSubject: '',
        revealedAt: '',
      })
    );
  });
});
