import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ColoringBookCard, type ColoringBookCardData } from './ColoringBookCard';

describe('coloring book card', () => {
  it('clamps completed pages to the page total', () => {
    const book = {
      id: 'book-example',
      title: 'Example book',
      status: 'in_progress',
      totalPages: 10,
      completedPages: 12,
    } as ColoringBookCardData;
    render(
      <MemoryRouter>
        <ColoringBookCard book={book} />
      </MemoryRouter>
    );
    expect(screen.getByText('10 of 10')).toBeInTheDocument();
  });
});
