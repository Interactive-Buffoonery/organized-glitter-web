import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ColoringPageColors from '../ColoringPageColors';

const state = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('@/hooks/useAppReady', () => ({ useAppReady: vi.fn() }));
vi.mock('@/hooks/usePageMetadata', () => ({ usePageMetadata: vi.fn() }));
vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/hooks/coloring/useColoringPageDetailData', () => ({
  useColoringPageDetailData: () => state.data,
}));
vi.mock('@/components/coloring/detail/page/ColorReferenceSection', () => ({
  ColorReferenceSection: ({ pageId }: { pageId: string }) => <div>Photos for {pageId}</div>,
}));
vi.mock('@/components/coloring/detail/page/colorKeys/ColorKeySection', () => ({
  ColorKeySection: ({ pageId, bookLabel }: { pageId: string; bookLabel: string }) => (
    <div>
      Color key for {pageId}, {bookLabel}
    </div>
  ),
}));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/coloring/:bookId/pages/:pageId/colors" element={<ColoringPageColors />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  state.data = {
    book: { id: 'book-1', title: 'Mystery Garden', totalPages: 40 },
    page: { id: 'page-1', bookId: 'book-1', pageNumber: 7 },
    isLoading: false,
    error: null,
    retry: vi.fn(),
  };
});

describe('Coloring page colors', () => {
  it('holds the strip photos and color key for the page, with a way back', () => {
    renderAt('/coloring/book-1/pages/page-1/colors?returnTo=%2Fdashboard%3Fcraft%3Dcoloring');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Colors for page 7' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Page 7/ })).toHaveAttribute(
      'href',
      '/coloring/book-1/pages/page-1?returnTo=%2Fdashboard%3Fcraft%3Dcoloring'
    );
    expect(screen.getByText('Photos for page-1')).toBeInTheDocument();
    expect(screen.getByText('Color key for page-1, Mystery Garden, page 7')).toBeInTheDocument();
  });

  it('explains when the page cannot be found', () => {
    state.data = {
      ...state.data,
      page: undefined,
      error: { type: 'not_found', message: 'Coloring page not found', retryable: false },
    };
    renderAt('/coloring/book-1/pages/missing/colors');
    expect(screen.getByText('Coloring page not found')).toBeInTheDocument();
    expect(screen.queryByText(/Photos for/)).toBeNull();
  });

  it('keeps the retry button in place while it tries again', async () => {
    const user = userEvent.setup();
    const failed = {
      ...state.data,
      page: undefined,
      error: { type: 'network', message: 'Network error', retryable: true },
      retry: vi.fn(() => new Promise<boolean>(() => {})),
    };
    state.data = failed;
    const view = renderAt('/coloring/book-1/pages/page-1/colors');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    state.data = { ...failed, isLoading: true, error: null };
    view.rerender(
      <MemoryRouter initialEntries={['/coloring/book-1/pages/page-1/colors']}>
        <Routes>
          <Route path="/coloring/:bookId/pages/:pageId/colors" element={<ColoringPageColors />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'Trying again' })).toBeInTheDocument();
    expect(screen.getByText('Trying again to load coloring page.')).toBeInTheDocument();
  });
});
