import { render, screen } from '@testing-library/react';
import ColoringBookListRow from './ColoringBookListRow';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ColoringBookCard, type ColoringBookCardData } from './ColoringBookCard';

describe('coloring book card', () => {
  it('shows the page count without a redundant percentage in list view', () => {
    render(
      <MemoryRouter>
        <ColoringBookListRow
          book={
            {
              id: 'book',
              title: 'Book',
              status: 'in_progress',
              totalPages: 10,
              completedPages: 0,
              completionPercentage: 0,
            } as ColoringBookCardData
          }
        />
      </MemoryRouter>
    );
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.getByText(/0 of 10/)).toBeInTheDocument();
  });

  it('clamps completed pages to the page total', () => {
    const book = {
      id: 'book-example',
      title: 'Our Very Own Star: The Sun',
      status: 'in_progress',
      totalPages: 10,
      completedPages: 12,
    } as ColoringBookCardData;
    render(
      <MemoryRouter>
        <ColoringBookCard book={book} />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: book.title })).toBeVisible();
    expect(screen.getByText('10 of 10')).toBeInTheDocument();
  });
});
