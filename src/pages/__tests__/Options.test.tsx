import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

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

vi.mock('@/components/ui/glass-panel', () => ({
  GlassPanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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

const renderOptions = () =>
  render(
    <MemoryRouter>
      <Options />
    </MemoryRouter>
  );

describe('Options', () => {
  beforeEach(() => {
    enabledVerticalsState.diamond_painting = true;
    enabledVerticalsState.coloring_books = true;
    enabledVerticalsState.isLoading = false;
  });

  it('shows coloring option links when coloring books are enabled', () => {
    renderOptions();

    expect(screen.getByRole('heading', { name: 'Coloring' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Publishers' })).toHaveAttribute(
      'href',
      '/options/publishers'
    );
    expect(screen.getByRole('link', { name: 'Illustrators' })).toHaveAttribute(
      'href',
      '/options/illustrators'
    );
    expect(screen.getByRole('link', { name: 'Coloring mediums' })).toHaveAttribute(
      'href',
      '/options/coloring-mediums'
    );
  });

  it('hides coloring option links when coloring books are disabled', () => {
    enabledVerticalsState.coloring_books = false;

    renderOptions();

    expect(screen.queryByRole('heading', { name: 'Coloring' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Publishers' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Illustrators' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Coloring mediums' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Companies' })).toHaveAttribute(
      'href',
      '/options/companies'
    );
  });

  it('hides diamond painting option links when diamond painting is disabled', () => {
    enabledVerticalsState.diamond_painting = false;

    renderOptions();

    expect(screen.queryByRole('heading', { name: 'Diamond painting' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Companies' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Artists' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tags' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Publishers' })).toHaveAttribute(
      'href',
      '/options/publishers'
    );
  });

  it('does not show option links while vertical preferences load', () => {
    enabledVerticalsState.diamond_painting = true;
    enabledVerticalsState.coloring_books = false;
    enabledVerticalsState.isLoading = true;

    renderOptions();

    expect(screen.getByText('Loading options…')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Companies' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Publishers' })).not.toBeInTheDocument();
  });

  it('uses the Manage Lists heading without a generated summary', () => {
    enabledVerticalsState.diamond_painting = false;
    enabledVerticalsState.coloring_books = true;

    renderOptions();

    expect(screen.getByRole('heading', { name: 'Manage Lists' })).toBeInTheDocument();
    expect(screen.queryByTestId('generated-summary')).not.toBeInTheDocument();
  });
});
