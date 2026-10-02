import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import ColoringBooksTable from '../ColoringBooksTable';
import type { ColoringBookCardData } from '../coloringBookCardTypes';

const book: ColoringBookCardData = {
  id: 'book-1',
  userId: 'user-1',
  title: 'Garden Pages',
  publisherId: '',
  illustratorId: '',
  series: '',
  theme: '',
  isbn: '',
  edition: '',
  language: '',
  sourceUrl: '',
  datePurchased: '',
  dateReceived: '',
  dateStarted: '',
  dateCompleted: '',
  bookFormat: '',
  notes: '',
  coverImage: '',
  isMystery: false,
  status: 'in_progress',
  totalPages: 20,
  completedPages: 5,
  completionPercentage: 25,
  createdAt: '',
  updatedAt: '',
};

describe('ColoringBooksTable', () => {
  it('announces the active sort direction and names each completion progress bar', () => {
    renderWithProviders(
      <ColoringBooksTable books={[book]} sortField="title" sortDirection="asc" onSort={vi.fn()} />
    );

    const activeHeader = screen
      .getAllByRole('columnheader', { name: /book/i })
      .find(header => header.closest('table'));
    expect(activeHeader).toHaveAttribute('aria-sort', 'ascending');
    const progressBars = screen.getAllByRole('progressbar', {
      name: 'Completion for Garden Pages',
    });
    expect(progressBars).toHaveLength(2);
    for (const progressBar of progressBars) {
      expect(progressBar).toHaveAttribute('aria-valuenow', '25');
    }
  });
});
