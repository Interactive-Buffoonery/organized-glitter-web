import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ColoringBookDTO, ColoringPageDTO } from '@/services/pocketbase/coloring.service';
import { ColoringBookPagesSection } from '../ColoringBookPagesSection';
import { ColoringBookHero } from '../ColoringBookHero';
import { ColoringBookDetailsSection } from '../ColoringBookDetailsSection';

vi.mock('@/components/image/PrivateFileImage', () => ({
  PrivateFileImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const book = {
  id: 'book',
  title: 'Garden',
  totalPages: 24,
  status: 'in_progress',
} as ColoringBookDTO;
const pages = Array.from({ length: 24 }, (_, index) => ({
  id: `page-${index + 1}`,
  bookId: 'book',
  pageNumber: index + 1,
  status:
    index === 0
      ? 'completed'
      : index === 1
        ? 'palette_chosen'
        : index === 2
          ? 'on_hold'
          : index === 3
            ? 'in_progress'
            : 'not_started',
  photos: [],
  revealedSubject: '',
})) as ColoringPageDTO[];
const renderPages = (overrides = {}) =>
  render(
    <MemoryRouter>
      <ColoringBookPagesSection
        book={book}
        pages={pages}
        latestPhotos={{}}
        isLoading={false}
        error={null}
        hasLoadedData
        isFetching={false}
        isRetrying={false}
        onRetry={vi.fn()}
        returnTo="/dashboard?craft=coloring"
        {...overrides}
      />
    </MemoryRouter>
  );

// These checks isolate grid transitions and mystery privacy that broad browser
// smoke journeys do not cover across all page-status and photo combinations.
describe('Coloring book pages', () => {
  it('counts every status and filters the complete book', async () => {
    const user = userEvent.setup();
    renderPages();
    expect(screen.getByRole('button', { name: 'All 24' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'In progress 3' }));
    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(screen.getByRole('link', { name: /page 2/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /page 3/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done 1' }));
    expect(screen.getAllByRole('link')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Not started 20' }));
    expect(screen.getAllByRole('link')).toHaveLength(20);
  });

  it('limits All to 18 tiles and expands without restricting filters', async () => {
    const user = userEvent.setup();
    renderPages();
    expect(screen.getAllByRole('link')).toHaveLength(18);
    await user.click(screen.getByRole('button', { name: 'Show all 24 pages' }));
    expect(screen.getAllByRole('link')).toHaveLength(24);
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument();
  });

  it('shows a latest photo with one number badge and a plain number otherwise', () => {
    renderPages({ latestPhotos: { 'page-1': '/latest.jpg' } });
    const photoTile = screen.getByRole('link', { name: /page 1\./i });
    expect(photoTile.querySelector('img')).toHaveAttribute('src', '/latest.jpg');
    expect(within(photoTile).getAllByText('1')).toHaveLength(1);
    const numberTile = screen.getByRole('link', { name: /page 2\./i });
    expect(numberTile.querySelector('img')).toBeNull();
    expect(within(numberTile).getAllByText('2')).toHaveLength(1);
  });

  it('keeps mystery photos hidden until revealed and includes known subjects', () => {
    renderPages({
      book: { ...book, isMystery: true },
      latestPhotos: { 'page-1': '/hidden.jpg', 'page-2': '/revealed.jpg' },
      pages: [pages[0], { ...pages[1], revealedSubject: 'Fox' }],
    });
    expect(
      screen.getByRole('link', { name: /page 1.*Mystery unrevealed/i }).querySelector('img')
    ).toBeNull();
    expect(
      screen.getByRole('link', { name: /page 2.*Fox.*Palette chosen/i }).querySelector('img')
    ).toHaveAttribute('src', '/revealed.jpg');
  });

  it('hides the page photo of an unrevealed mystery page', () => {
    renderPages({
      book: { ...book, isMystery: true },
      pages: [{ ...pages[0], photos: ['x.jpg'] }],
    });
    expect(
      screen.getByRole('link', { name: /page 1.*Mystery unrevealed/i }).querySelector('img')
    ).toBeNull();
  });
});

describe('Coloring book sidebar', () => {
  it('renders no cover box for a book without a cover', () => {
    render(
      <ColoringBookHero
        book={book}
        coverUrl=""
        safeCompletedPages={1}
        safeCompletionPct={4}
        inProgressPages={3}
        updatePending={false}
        onStatusChange={vi.fn()}
      />
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText('No cover')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 24 done')).toBeInTheDocument();
  });

  it('offers an Add action for each empty value and opens the existing edit flow', async () => {
    const onEdit = vi.fn();
    render(
      <ColoringBookDetailsSection
        items={[
          { label: 'Publisher', value: 'Books' },
          { label: 'Language', value: '' },
          { label: 'Series' },
        ]}
        onEdit={onEdit}
      />
    );
    expect(screen.getAllByRole('button', { name: /^Add / })).toHaveLength(2);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add Language' }));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(screen.getByText('Books')).toBeInTheDocument();
  });
});
