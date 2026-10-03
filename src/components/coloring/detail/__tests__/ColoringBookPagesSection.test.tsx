import '@testing-library/jest-dom/vitest';
import { describe, expect, it, renderWithProviders, screen, userEvent, vi } from '@/test-utils';
import type { ColoringBookDTO, ColoringPageDTO } from '@/services/pocketbase/coloring.service';
import { ColoringBookPagesSection } from '../ColoringBookPagesSection';

const book = {
  id: 'book-123',
  title: 'Worlds of Wonder',
  isMystery: false,
} as ColoringBookDTO;

describe('ColoringBookPagesSection', () => {
  it('names batch controls with the configured page size', () => {
    renderWithProviders(
      <ColoringBookPagesSection
        book={book}
        pages={[]}
        isLoading={false}
        page={1}
        perPage={100}
        totalItems={240}
        returnTo="/dashboard?craft=coloring&page=3&pageSize=50"
        onPageChange={() => undefined}
        error={null}
        hasLoadedData={true}
        isFetching={false}
        isRetrying={false}
        onRetry={() => undefined}
      />
    );

    expect(screen.getByRole('button', { name: 'Previous 100 pages' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next 100 pages' })).toBeEnabled();
  });

  it('shows a retryable error instead of an empty grid after the first page-list failure', async () => {
    const onRetry = vi.fn();
    renderWithProviders(
      <ColoringBookPagesSection
        book={book}
        pages={[]}
        isLoading={false}
        error={{ type: 'network', message: 'Offline', retryable: true }}
        hasLoadedData={false}
        isFetching={false}
        isRetrying={false}
        onRetry={onRetry}
        page={1}
        perPage={500}
        totalItems={40}
        returnTo="/dashboard?craft=coloring&page=3"
        onPageChange={() => undefined}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load coloring book pages');
    expect(screen.queryByText('0 pages')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('keeps cached page cards while showing a refresh retry', () => {
    renderWithProviders(
      <ColoringBookPagesSection
        book={book}
        pages={[
          {
            id: 'page-1',
            pageNumber: 1,
            bookId: 'book-123',
            status: 'not_started',
            photos: [],
          } as ColoringPageDTO,
        ]}
        isLoading={false}
        error={{ type: 'network', message: 'Offline', retryable: true }}
        hasLoadedData={true}
        isFetching={false}
        isRetrying={false}
        onRetry={() => undefined}
        page={1}
        perPage={500}
        totalItems={600}
        returnTo="/dashboard?craft=coloring&page=3"
        onPageChange={() => undefined}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Could not refresh coloring book pages');
    expect(screen.getByRole('link', { name: /Open page 1/ })).toBeVisible();
    expect(screen.getByRole('link', { name: /Open page 1/ })).toHaveAttribute(
      'href',
      '/coloring/book-123/pages/page-1?returnTo=%2Fdashboard%3Fcraft%3Dcoloring%26page%3D3'
    );
    expect(screen.getByRole('navigation', { name: 'Coloring book pages' })).toBeVisible();
  });

  it.each([900, 0])(
    'lets a failed second batch return to the first when total items are %s',
    async totalItems => {
      const onPageChange = vi.fn();
      renderWithProviders(
        <ColoringBookPagesSection
          book={book}
          pages={[]}
          isLoading={false}
          error={{ type: 'server', message: 'Unavailable', retryable: true }}
          hasLoadedData={false}
          isFetching={false}
          isRetrying={false}
          onRetry={vi.fn()}
          page={2}
          perPage={500}
          totalItems={totalItems}
          returnTo="/dashboard?craft=coloring&page=3"
          onPageChange={onPageChange}
        />
      );

      expect(screen.getByRole('alert')).toHaveTextContent('Could not load coloring book pages');
      expect(screen.queryByText('0 pages')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Previous 500 pages' })).toBeEnabled();
      expect(screen.queryByRole('button', { name: 'Next 500 pages' })).not.toBeInTheDocument();
      await userEvent.setup().click(screen.getByRole('button', { name: 'Previous 500 pages' }));
      expect(onPageChange).toHaveBeenCalledWith(1);
    }
  );

  it.each(['auth', 'permission', 'not_found'])(
    'hides cached pages and pagination after a %s list denial',
    type => {
      renderWithProviders(
        <ColoringBookPagesSection
          book={book}
          pages={[
            {
              id: 'page-1',
              pageNumber: 1,
              bookId: 'book-123',
              status: 'not_started',
              photos: ['private.jpg'],
            } as ColoringPageDTO,
          ]}
          isLoading={false}
          error={{ type, message: 'Access denied', retryable: false }}
          hasLoadedData={true}
          isFetching={false}
          isRetrying={false}
          onRetry={vi.fn()}
          page={1}
          perPage={500}
          totalItems={600}
          returnTo="/dashboard?craft=coloring&page=3"
          onPageChange={() => undefined}
        />
      );

      expect(screen.getByRole('alert')).toHaveTextContent(/coloring book pages/i);
      expect(screen.queryByRole('link', { name: /Open page 1/ })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('navigation', { name: 'Coloring book pages' })
      ).not.toBeInTheDocument();
      expect(screen.queryByText('1-500 of 600 pages')).not.toBeInTheDocument();
    }
  );

  it('hides backward navigation after a second-batch access denial', () => {
    renderWithProviders(
      <ColoringBookPagesSection
        book={book}
        pages={[]}
        isLoading={false}
        error={{ type: 'permission', message: 'Denied', retryable: false }}
        hasLoadedData={false}
        isFetching={false}
        isRetrying={false}
        onRetry={vi.fn()}
        page={2}
        perPage={500}
        totalItems={900}
        returnTo="/dashboard?craft=coloring&page=3"
        onPageChange={vi.fn()}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('You cannot view coloring book pages');
    expect(
      screen.queryByRole('navigation', { name: 'Coloring book pages' })
    ).not.toBeInTheDocument();
  });

  it.each([
    ['auth', false, 'Sign in to view coloring book pages'],
    ['permission', false, 'You cannot view coloring book pages'],
    ['validation', true, 'Could not refresh coloring book pages'],
  ] as const)(
    'does not offer retry for a terminal %s page-list failure',
    (type, hasLoadedData, message) => {
      renderWithProviders(
        <ColoringBookPagesSection
          book={book}
          pages={[]}
          isLoading={false}
          error={{ type, message: 'Cannot retry', retryable: false }}
          hasLoadedData={hasLoadedData}
          isFetching={false}
          isRetrying={false}
          onRetry={vi.fn()}
          page={1}
          perPage={500}
          totalItems={40}
          returnTo="/dashboard?craft=coloring&page=3"
          onPageChange={() => undefined}
        />
      );

      expect(screen.getByRole('alert')).toHaveTextContent(message);
      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    }
  );
});
