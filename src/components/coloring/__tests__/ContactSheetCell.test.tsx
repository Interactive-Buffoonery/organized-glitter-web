import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ContactSheetCell } from '../ContactSheetCell';
import type { ColoringPageDTO } from '@/services/pocketbase/coloring.service';

vi.mock('@/services/pocketbase/coloring.service', () => ({
  ColoringService: {
    getPagePhotoUrls: (page: Pick<ColoringPageDTO, 'id' | 'photos'>) =>
      page.photos.map(photo => `/page-files/${page.id}/${photo}`),
  },
}));

const basePage: ColoringPageDTO = {
  id: 'page-7',
  bookId: 'book-1',
  pageNumber: 7,
  status: 'in_progress',
  photos: [],
  mediumIds: [],
  revealedSubject: '',
  revealedAt: '',
  startedAt: '',
  completedAt: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderCell(page: Partial<ColoringPageDTO> = {}, isMysteryBook = false) {
  const mergedPage = { ...basePage, ...page };
  return render(
    <MemoryRouter>
      <ContactSheetCell
        bookId="book-1"
        page={mergedPage}
        returnTo="/dashboard?craft=coloring&page=3&pageSize=50"
        isMysteryBook={isMysteryBook}
      />
    </MemoryRouter>
  );
}

describe('ContactSheetCell', () => {
  it('renders a photo cell that links to the page route', () => {
    const { container } = renderCell({ photos: ['photo.jpg'], status: 'completed' });

    expect(screen.getByRole('link', { name: /open page 7/i })).toHaveAttribute(
      'href',
      '/coloring/book-1/pages/page-7?returnTo=%2Fdashboard%3Fcraft%3Dcoloring%26page%3D3%26pageSize%3D50'
    );
    expect(container.querySelector('img')).toHaveAttribute('src', '/page-files/page-7/photo.jpg');
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders an empty cell with the page number', () => {
    renderCell({ photos: [], status: 'not_started' });

    expect(screen.getByRole('link', { name: /status: not started/i })).toBeInTheDocument();
    expect(screen.getAllByText('7').length).toBeGreaterThan(0);
    expect(screen.getByText('Not started')).toBeInTheDocument();
  });

  it('renders unrevealed mystery state accessibly', () => {
    const { container } = renderCell(
      { photos: ['hidden.jpg'], revealedSubject: '', status: 'palette_chosen' },
      true
    );

    expect(screen.getByRole('link', { name: /mystery unrevealed/i })).toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByText('Mystery unrevealed')).toBeInTheDocument();
  });

  it('renders a revealed mystery page with its photo and status label', () => {
    const { container } = renderCell(
      { photos: ['dragon.jpg'], revealedSubject: 'Dragon', status: 'on_hold' },
      true
    );

    expect(screen.getByRole('link', { name: /status: on hold/i })).toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute('src', '/page-files/page-7/dragon.jpg');
    expect(screen.getByText('On hold')).toBeInTheDocument();
  });
});
