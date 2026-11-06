import type {
  BulkPhotoImportResult,
  BulkPhotoLibrary,
  BulkPhotoReviewRow,
} from '@/features/import-export/bulk-photos/types';

type ReviewData = {
  id: number;
  rows: BulkPhotoReviewRow[];
  library: BulkPhotoLibrary;
  lastResult: BulkPhotoImportResult | null;
};
export type BulkPhotoState =
  | { phase: 'idle'; id: number; rows: BulkPhotoReviewRow[] }
  | { phase: 'analyzing'; id: number; rows: BulkPhotoReviewRow[] }
  | ({ phase: 'review' } & ReviewData)
  | ({ phase: 'importing' } & ReviewData);

export const initialBulkPhotoState: BulkPhotoState = { phase: 'idle', id: 0, rows: [] };
type BulkPhotoEvent =
  | { type: 'analyze' }
  | { type: 'ready'; id: number; rows: BulkPhotoReviewRow[]; library: BulkPhotoLibrary }
  | { type: 'analysis-finished'; id: number }
  | { type: 'rows'; rows: BulkPhotoReviewRow[] }
  | { type: 'import' }
  | { type: 'result'; id: number; result: BulkPhotoImportResult }
  | { type: 'import-finished'; id: number };

export function transitionBulkPhoto(state: BulkPhotoState, event: BulkPhotoEvent): BulkPhotoState {
  switch (event.type) {
    case 'analyze':
      return { phase: 'analyzing', id: state.id + 1, rows: [] };
    case 'ready':
      return state.phase === 'analyzing' && state.id === event.id
        ? {
            phase: 'review',
            id: state.id,
            rows: event.rows,
            library: event.library,
            lastResult: null,
          }
        : state;
    case 'analysis-finished':
      return state.phase === 'analyzing' && state.id === event.id
        ? { phase: 'idle', id: state.id, rows: [] }
        : state;
    case 'rows':
      return { ...state, rows: event.rows };
    case 'import':
      return state.phase === 'review' ? { ...state, phase: 'importing' } : state;
    case 'result':
      return state.phase === 'importing' && state.id === event.id
        ? { ...state, lastResult: event.result }
        : state;
    case 'import-finished':
      return state.phase === 'importing' && state.id === event.id
        ? { ...state, phase: 'review' }
        : state;
  }
}
