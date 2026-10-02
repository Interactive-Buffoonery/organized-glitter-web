import '@testing-library/jest-dom/vitest';
import React from 'react';
import { vi } from 'vitest';
import { beforeEach, describe, expect, it, renderWithProviders, screen } from '@/test-utils';

const { enabledVerticalsState } = vi.hoisted(() => ({
  enabledVerticalsState: {
    diamond_painting: true,
    coloring_books: true,
    isLoading: false,
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-123' } }),
}));

vi.mock('@/hooks/useEnabledVerticals', () => ({
  useEnabledVerticals: () => enabledVerticalsState,
}));

vi.mock('../NewProject', () => ({
  default: () => <div>New diamond project form</div>,
}));

vi.mock('../NewColoringBook', () => ({
  default: () => <div>New coloring book form</div>,
}));

import NewProjectRouter from '../NewProjectRouter';

describe('NewProjectRouter metadata', () => {
  beforeEach(() => {
    document.title = 'Organized Glitter - Coloring Book and Diamond Art Tracker';
    enabledVerticalsState.diamond_painting = true;
    enabledVerticalsState.coloring_books = true;
    enabledVerticalsState.isLoading = false;
  });

  it('sets a specific title for diamond project creation', () => {
    renderWithProviders(<NewProjectRouter />, { initialRoute: '/projects/new' });

    expect(screen.getByText('New diamond project form')).toBeInTheDocument();
    expect(document.title).toBe('New project | Organized Glitter');
  });

  it('sets a specific title for coloring book creation', () => {
    renderWithProviders(<NewProjectRouter />, { initialRoute: '/projects/new?craft=coloring' });

    expect(screen.getByText('New coloring book form')).toBeInTheDocument();
    expect(document.title).toBe('New coloring book | Organized Glitter');
  });
});
