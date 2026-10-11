import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

const { enabledVerticalsState } = vi.hoisted(() => ({
  enabledVerticalsState: {
    diamond_painting: true,
    coloring_books: true,
    isLoading: false,
  },
}));

vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/hooks/useAppReady', () => ({
  useAppReady: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-123' },
  }),
}));

vi.mock('@/hooks/useEnabledVerticals', () => ({
  useEnabledVerticals: () => enabledVerticalsState,
}));

import Options from '../Options';

const originalMatchMedia = window.matchMedia;

let isDesktopScreen = false;
const mediaListeners = new Set<() => void>();

const setDesktop = (isDesktop: boolean) => {
  isDesktopScreen = isDesktop;
  mediaListeners.forEach(listener => listener());
};

const mockMatchMedia = () => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    get matches() {
      return isDesktopScreen;
    },
    media: query,
    addEventListener: (_event: string, listener: () => void) => mediaListeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => mediaListeners.delete(listener),
  }));
};

const renderOptions = () =>
  render(
    <MemoryRouter initialEntries={['/options']}>
      <Routes>
        <Route path="/options" element={<Options />} />
        <Route path="/options/:list" element={<p>List page</p>} />
      </Routes>
    </MemoryRouter>
  );

describe('Options', () => {
  beforeEach(() => {
    enabledVerticalsState.diamond_painting = true;
    enabledVerticalsState.coloring_books = true;
    enabledVerticalsState.isLoading = false;
    mediaListeners.clear();
    mockMatchMedia();
    setDesktop(false);
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('shows the list picker on small screens', () => {
    renderOptions();

    expect(screen.getByRole('heading', { name: 'Manage Lists' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Companies' })).toHaveAttribute(
      'href',
      '/options/companies'
    );
    expect(screen.getByRole('link', { name: 'Publishers' })).toHaveAttribute(
      'href',
      '/options/publishers'
    );
  });

  it('opens the first enabled list on large screens', () => {
    setDesktop(true);
    enabledVerticalsState.diamond_painting = false;

    renderOptions();

    expect(screen.getByText('List page')).toBeInTheDocument();
  });

  it('opens the first list when the screen grows to large', () => {
    renderOptions();
    expect(screen.queryByText('List page')).not.toBeInTheDocument();

    act(() => setDesktop(true));

    expect(screen.getByText('List page')).toBeInTheDocument();
  });

  it('stays on the picker while craft preferences load on large screens', () => {
    setDesktop(true);
    enabledVerticalsState.isLoading = true;

    renderOptions();

    expect(screen.queryByText('List page')).not.toBeInTheDocument();
    expect(screen.getByText('Loading lists…')).toBeInTheDocument();
  });
});
