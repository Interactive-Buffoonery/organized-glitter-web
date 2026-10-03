import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import LibraryPagination from '@/components/ui/LibraryPagination';

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

describe('LibraryPagination', () => {
  it('renders book ranges and sends page navigation', () => {
    const onPageChange = vi.fn();

    render(
      <LibraryPagination
        currentPage={1}
        totalPages={2}
        pageSize={50}
        totalItems={51}
        onPageChange={onPageChange}
        onPageSizeChange={vi.fn()}
        itemLabel="book"
        itemsLabel="books"
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('Showing 1-50 of 51 books');
    expect(screen.getByRole('button', { name: 'Go to previous page' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('keeps page size available when all results fit on one page', () => {
    render(
      <LibraryPagination
        currentPage={1}
        totalPages={1}
        pageSize={50}
        totalItems={1}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        itemLabel="book"
        itemsLabel="books"
      />
    );

    expect(screen.getByText('Showing 1 book')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Items per page' })).toBeEnabled();
  });

  it('renders linkable pages while keeping ordinary clicks in the app', () => {
    const onPageChange = vi.fn();

    render(
      <LibraryPagination
        currentPage={1}
        totalPages={2}
        pageSize={50}
        totalItems={51}
        onPageChange={onPageChange}
        onPageSizeChange={vi.fn()}
        getPageHref={page => `/dashboard?craft=coloring&page=${page}&pageSize=50`}
        itemLabel="book"
        itemsLabel="books"
      />
    );

    const next = screen.getByRole('link', { name: 'Go to next page' });
    expect(next).toHaveAttribute('href', '/dashboard?craft=coloring&page=2&pageSize=50');

    fireEvent.click(next);
    expect(onPageChange).toHaveBeenCalledWith(2);

    onPageChange.mockClear();
    next.addEventListener('click', event => event.preventDefault(), { once: true });
    fireEvent.click(next, { ctrlKey: true });
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('announces loading without replacing the current result count', () => {
    render(
      <LibraryPagination
        currentPage={1}
        totalPages={1}
        pageSize={50}
        totalItems={1}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        itemLabel="book"
        itemsLabel="books"
        isLoading
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('Loading page 1');
    expect(screen.getByRole('combobox', { name: 'Items per page' })).toBeEnabled();
  });
});
