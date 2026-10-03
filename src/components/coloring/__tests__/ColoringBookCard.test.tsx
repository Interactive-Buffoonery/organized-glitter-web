import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test-utils';
import { ColoringBooksStatusOptions } from '@/types/pocketbase.types';
import { ColoringBookCard, type ColoringBookCardData } from '../ColoringBookCard';

vi.mock('@/services/pocketbase/coloring.service', () => ({
  ColoringService: {
    getCoverImageUrl: vi.fn(() => 'https://example.com/cover.jpg'),
  },
}));

const baseBook: ColoringBookCardData = {
  id: 'book-1',
  userId: 'user-1',
  title: 'Wreckage of the Heart',
  publisherId: 'pub-1',
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
  coverImage: 'cover.jpg',
  isMystery: false,
  status: ColoringBooksStatusOptions.in_progress,
  totalPages: 50,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  publisherName: 'Mystic Forest Press',
  completedPages: 25,
  completionPercentage: 50,
};

describe('ColoringBookCard', () => {
  it('renders title, publisher, and computed completion percent', () => {
    renderWithProviders(<ColoringBookCard book={baseBook} />);

    expect(screen.getByText('Wreckage of the Heart')).toBeInTheDocument();
    expect(screen.getByText('Mystic Forest Press')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('names the completion progress bar with its book title', () => {
    renderWithProviders(<ColoringBookCard book={baseBook} />);

    expect(
      screen.getByRole('progressbar', { name: 'Completion for Wreckage of the Heart' })
    ).toBeInTheDocument();
  });

  it('shows status pill matching the book status', () => {
    renderWithProviders(<ColoringBookCard book={baseBook} />);
    expect(screen.getByText('In progress')).toBeInTheDocument();
  });

  it('shows the mystery badge only when is_mystery is true', () => {
    const { rerender } = renderWithProviders(<ColoringBookCard book={baseBook} />);
    expect(screen.queryByText('Mystery')).not.toBeInTheDocument();

    rerender(<ColoringBookCard book={{ ...baseBook, isMystery: true }} />);
    expect(screen.getByText('Mystery')).toBeInTheDocument();
  });

  it('falls back to series text when no publisher name is provided', () => {
    renderWithProviders(
      <ColoringBookCard book={{ ...baseBook, publisherName: undefined, series: 'Mystic Vol. 2' }} />
    );
    expect(screen.getByText('Mystic Vol. 2')).toBeInTheDocument();
  });

  it('renders a link pointing at the book detail route', () => {
    renderWithProviders(<ColoringBookCard book={baseBook} />, {
      initialRoute: '/dashboard?craft=coloring&page=3&pageSize=50',
    });
    const link = screen.getByRole('link', { name: /Open coloring book/i });
    expect(link).toHaveAttribute(
      'href',
      '/coloring/book-1?returnTo=%2Fdashboard%3Fcraft%3Dcoloring%26page%3D3%26pageSize%3D50'
    );
  });

  it('clamps completion to 0% when totalPages is zero', () => {
    renderWithProviders(
      <ColoringBookCard
        book={{ ...baseBook, totalPages: 0, completedPages: 5, completionPercentage: 0 }}
      />
    );
    expect(screen.getByText('0%')).toBeInTheDocument();
  });
});
