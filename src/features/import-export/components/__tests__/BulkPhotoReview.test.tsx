import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BulkPhotoReviewRow } from '../../bulk-photos/types';
import { BulkPhotoReviewCards, BulkPhotoReviewTableDesktop } from '../BulkPhotoReview';

const targets = [
  {
    id: 'project',
    label: 'Project',
    types: ['project-cover', 'project-progress-note'] as const,
    hasCover: true,
  },
  { id: 'book', label: 'Book', types: ['coloring-book-cover'] as const, hasCover: false },
];
let row: BulkPhotoReviewRow;
beforeEach(() => {
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:photo'), revokeObjectURL: vi.fn() });
  row = {
    id: 'row',
    file: new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }),
    path: 'photo.jpg',
    targetType: 'project-progress-note',
    targetId: 'project',
    targetLabel: 'Project',
    confidence: 'high',
    reason: 'Matched title',
    confirmed: true,
    excluded: false,
    overwrite: false,
  };
});
afterEach(() => vi.unstubAllGlobals());

for (const Component of [BulkPhotoReviewCards, BulkPhotoReviewTableDesktop]) {
  describe(Component.name, () => {
    it('requires opt-in when changing a progress note to an existing cover', () => {
      const update = vi.fn();
      render(<Component rows={[row]} targetOptions={targets} updateBulkRow={update} />);
      fireEvent.change(screen.getByLabelText('Target type'), {
        target: { value: 'project-cover' },
      });
      expect(update).toHaveBeenCalledWith(
        row,
        expect.objectContaining({
          targetId: 'project',
          targetType: 'project-cover',
          confirmed: false,
          excluded: true,
          overwrite: false,
          skipReasonCode: 'existing-cover',
        })
      );
    });

    it('clears the old target when switching crafts', () => {
      const update = vi.fn();
      render(<Component rows={[row]} targetOptions={targets} updateBulkRow={update} />);
      fireEvent.change(screen.getByLabelText('Target type'), {
        target: { value: 'coloring-book-cover' },
      });
      expect(update).toHaveBeenCalledWith(
        row,
        expect.objectContaining({
          targetId: undefined,
          targetLabel: undefined,
          confirmed: false,
          excluded: true,
        })
      );
    });

    it('filters targets by craft and confirms an available target', () => {
      const update = vi.fn();
      render(
        <Component
          rows={[{ ...row, targetType: 'coloring-book-cover', targetId: undefined }]}
          targetOptions={targets}
          updateBulkRow={update}
        />
      );
      const select = screen.getByLabelText('Target record');
      expect(select).toHaveTextContent('Book');
      expect(select).not.toHaveTextContent('Project');
      fireEvent.change(select, { target: { value: 'book' } });
      expect(update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          targetId: 'book',
          confirmed: true,
          excluded: false,
          overwrite: false,
        })
      );
    });

    it('releases thumbnail URLs on file replacement and unmount', () => {
      const { rerender, unmount } = render(
        <Component rows={[row]} targetOptions={targets} updateBulkRow={vi.fn()} />
      );
      expect(URL.createObjectURL).toHaveBeenCalledWith(row.file);
      rerender(
        <Component
          rows={[{ ...row, file: new File(['new'], 'new.jpg') }]}
          targetOptions={targets}
          updateBulkRow={vi.fn()}
        />
      );
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
      unmount();
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    });
  });
}
