import { describe, expect, it } from 'vitest';
import { initialBulkPhotoState, transitionBulkPhoto } from '../bulkPhotoState';
import type { BulkPhotoLibrary } from '@/features/import-export/bulk-photos/types';

const library: BulkPhotoLibrary = { diamondProjects: [], coloringBooks: [], coloringPages: [] };
describe('bulk photo phases', () => {
  it('rejects results and finalizers from superseded analyses', () => {
    const first = transitionBulkPhoto(initialBulkPhotoState, { type: 'analyze' });
    const second = transitionBulkPhoto(first, { type: 'analyze' });
    expect(transitionBulkPhoto(second, { type: 'ready', id: first.id, rows: [], library })).toBe(
      second
    );
    expect(transitionBulkPhoto(second, { type: 'analysis-finished', id: first.id })).toBe(second);
  });
  it('keeps review data after failure and rejects stale import results', () => {
    const analyzing = transitionBulkPhoto(initialBulkPhotoState, { type: 'analyze' });
    const ready = transitionBulkPhoto(analyzing, {
      type: 'ready',
      id: analyzing.id,
      rows: [],
      library,
    });
    const importing = transitionBulkPhoto(ready, { type: 'import' });
    expect(importing.phase).toBe('importing');
    const finished = transitionBulkPhoto(importing, { type: 'import-finished', id: importing.id });
    expect(finished.phase).toBe('review');
    expect('library' in finished && finished.library).toBe(library);
    const newer = transitionBulkPhoto(importing, { type: 'analyze' });
    expect(transitionBulkPhoto(newer, { type: 'import-finished', id: importing.id })).toBe(newer);
  });
  it('does not import before review is ready', () => {
    expect(transitionBulkPhoto(initialBulkPhotoState, { type: 'import' })).toBe(
      initialBulkPhotoState
    );
  });
  it('accepts row replacements only during review', () => {
    const analyzing = transitionBulkPhoto(initialBulkPhotoState, { type: 'analyze' });
    const review = transitionBulkPhoto(analyzing, {
      type: 'ready',
      id: analyzing.id,
      rows: [],
      library,
    });
    const importing = transitionBulkPhoto(review, { type: 'import' });
    const rows: typeof review.rows = [];
    for (const state of [initialBulkPhotoState, analyzing, importing]) {
      expect(transitionBulkPhoto(state, { type: 'rows', rows })).toBe(state);
    }
    expect(transitionBulkPhoto(review, { type: 'rows', rows }).rows).toBe(rows);
  });
});
