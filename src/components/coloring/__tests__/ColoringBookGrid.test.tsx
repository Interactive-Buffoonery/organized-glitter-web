import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, screen } from '@/test-utils';
import { ColoringBooksStatusOptions } from '@/types/pocketbase.types';

import { ColoringBookGrid } from '../ColoringBookGrid';
import type { ColoringBookCardData } from '../coloringBookCardTypes';

const baseBook: ColoringBookCardData = {
  id: 'book-1',
  userId: 'user-1',
  title: 'Woodland Windows',
  publisherId: '',
  illustratorId: '',
  series: '',
  theme: '',
  isbn: '',
  publicationYear: undefined,
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
  status: ColoringBooksStatusOptions.in_progress,
  totalPages: 10,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  publisherName: undefined,
  completedPages: 4,
  completionPercentage: 40,
};

describe('ColoringBookGrid', () => {
  it('announces skeleton loading as a busy status region', () => {
    renderWithProviders(
      <ColoringBookGrid books={[]} isLoading hasActiveFilters={false} viewType="grid" />
    );

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('Loading coloring books');
  });

  it('clears the busy loading status when books render', () => {
    renderWithProviders(
      <ColoringBookGrid
        books={[baseBook]}
        isLoading={false}
        hasActiveFilters={false}
        viewType="grid"
      />
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading coloring books')).not.toBeInTheDocument();
  });
});
