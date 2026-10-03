import '@testing-library/jest-dom/vitest';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, renderWithProviders, screen } from '@/test-utils';
import { SpinHistory } from '../SpinHistory';

const useSpinHistoryMock = vi.fn();
const useSpinHistoryCountMock = vi.fn();

vi.mock('@/hooks/queries/useSpinHistory', () => ({
  useSpinHistory: (args: unknown) => useSpinHistoryMock(args),
}));

vi.mock('@/hooks/queries/useSpinHistoryCount', () => ({
  useSpinHistoryCount: (args: unknown) => useSpinHistoryCountMock(args),
}));

const renderSpinHistory = (props: Partial<React.ComponentProps<typeof SpinHistory>> = {}) => (
  <SpinHistory userId="user-12345678901" canUseDiamond canUseColoring {...props} />
);

describe('SpinHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not show the load-more control when exactly eight total spins exist', () => {
    useSpinHistoryMock.mockReturnValue({
      data: Array.from({ length: 8 }, (_, index) => ({
        id: `spin-${index}`,
        project: `project-${index}`,
        project_title: `Project ${index}`,
        selected_projects: ['a', 'b'],
        spun_at: '2026-04-22T12:00:00.000Z',
      })),
      isLoading: false,
    });
    useSpinHistoryCountMock.mockReturnValue({
      data: 8,
    });

    renderWithProviders(renderSpinHistory());

    expect(screen.queryByRole('button', { name: /show more history/i })).not.toBeInTheDocument();
  });

  it('can hide its internal heading when the parent region already has one', () => {
    useSpinHistoryMock.mockReturnValue({
      data: [],
      isLoading: false,
    });
    useSpinHistoryCountMock.mockReturnValue({
      data: 0,
    });

    renderWithProviders(renderSpinHistory({ hideHeader: true }));

    expect(screen.queryByRole('heading', { name: 'Spin History' })).not.toBeInTheDocument();
    expect(screen.getByText('No spins yet')).toBeInTheDocument();
  });

  it('shows the load-more control when there are more spins than the current page', () => {
    useSpinHistoryMock.mockReturnValue({
      data: Array.from({ length: 8 }, (_, index) => ({
        id: `spin-${index}`,
        project: `project-${index}`,
        project_title: `Project ${index}`,
        selected_projects: ['a', 'b'],
        spun_at: '2026-04-22T12:00:00.000Z',
      })),
      isLoading: false,
    });
    useSpinHistoryCountMock.mockReturnValue({
      data: 9,
    });

    renderWithProviders(renderSpinHistory());

    expect(screen.getByRole('button', { name: /show more history/i })).toBeInTheDocument();
  });

  it('renders metadata-based coloring history links', () => {
    useSpinHistoryMock.mockReturnValue({
      data: [
        {
          id: 'spin-1',
          project: '',
          project_title: 'Garden Pages',
          project_company: '',
          project_artist: '',
          selected_projects: ['book-1', 'book-2'],
          metadata: {
            version: 1,
            mode: 'coloring-book',
            target: {
              id: 'book-1',
              targetType: 'coloring_book',
              title: 'Garden Pages',
              subtitle: 'Indie Press',
              href: '/coloring/book-1',
            },
            selectedTargetIds: ['book-1', 'book-2'],
          },
          spun_at: '2026-04-22T12:00:00.000Z',
        },
      ],
      isLoading: false,
    });
    useSpinHistoryCountMock.mockReturnValue({
      data: 1,
    });

    renderWithProviders(renderSpinHistory());

    expect(screen.getByText('Coloring book')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to garden pages/i })).toHaveAttribute(
      'href',
      '/coloring/book-1'
    );
  });

  it('falls back to legacy project fields when metadata has no target', () => {
    useSpinHistoryMock.mockReturnValue({
      data: [
        {
          id: 'spin-1',
          project: 'project-1',
          project_title: 'Legacy Diamond',
          project_company: 'Old Company',
          project_artist: '',
          selected_projects: ['project-1', 'project-2'],
          metadata: {
            version: 1,
          },
          spun_at: '2026-04-22T12:00:00.000Z',
        },
      ],
      isLoading: false,
    });
    useSpinHistoryCountMock.mockReturnValue({
      data: 1,
    });

    renderWithProviders(renderSpinHistory());

    expect(screen.getByText('Legacy Diamond')).toBeInTheDocument();
    expect(screen.getByText('Diamond painting')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to legacy diamond/i })).toHaveAttribute(
      'href',
      '/projects/project-1'
    );
  });

  it('filters mixed-mode spin history without losing mode badges', () => {
    useSpinHistoryMock.mockReturnValue({
      data: [
        {
          id: 'spin-diamond',
          project: 'project-1',
          project_title: 'Aurora Wolves',
          selected_projects: ['project-1'],
          metadata: {
            version: 1,
            mode: 'diamond',
            target: {
              id: 'project-1',
              targetType: 'diamond_project',
              title: 'Aurora Wolves',
              subtitle: 'Moonlight Co.',
              href: '/projects/project-1',
            },
            selectedTargetIds: ['project-1'],
          },
          spun_at: '2026-04-22T12:00:00.000Z',
        },
        {
          id: 'spin-book',
          project: '',
          project_title: 'Garden Pages',
          selected_projects: ['book-1'],
          metadata: {
            version: 1,
            mode: 'coloring-book',
            target: {
              id: 'book-1',
              targetType: 'coloring_book',
              title: 'Garden Pages',
              subtitle: 'Indie Press',
              href: '/coloring/book-1',
            },
            selectedTargetIds: ['book-1'],
          },
          spun_at: '2026-04-22T12:00:00.000Z',
        },
      ],
      isLoading: false,
    });
    useSpinHistoryCountMock.mockReturnValue({
      data: 2,
    });

    renderWithProviders(renderSpinHistory());

    expect(screen.getByText('Aurora Wolves')).toBeInTheDocument();
    expect(screen.getByText('Garden Pages')).toBeInTheDocument();
    expect(screen.getByText('Coloring books')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Books' }));

    expect(screen.queryByText('Aurora Wolves')).not.toBeInTheDocument();
    expect(screen.getByText('Garden Pages')).toBeInTheDocument();
    expect(screen.getByText('Coloring books')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Books' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('hides coloring history and filters when coloring is disabled', () => {
    useSpinHistoryMock.mockReturnValue({
      data: [
        {
          id: 'spin-diamond',
          project: 'project-1',
          project_title: 'Aurora Wolves',
          selected_projects: ['project-1'],
          metadata: {
            version: 1,
            mode: 'diamond',
            target: {
              id: 'project-1',
              targetType: 'diamond_project',
              title: 'Aurora Wolves',
              subtitle: 'Moonlight Co.',
              href: '/projects/project-1',
            },
            selectedTargetIds: ['project-1'],
          },
          spun_at: '2026-04-22T12:00:00.000Z',
        },
        {
          id: 'spin-book',
          project: '',
          project_title: 'Garden Pages',
          selected_projects: ['book-1'],
          metadata: {
            version: 1,
            mode: 'coloring-book',
            target: {
              id: 'book-1',
              targetType: 'coloring_book',
              title: 'Garden Pages',
              subtitle: 'Indie Press',
              href: '/coloring/book-1',
            },
            selectedTargetIds: ['book-1'],
          },
          spun_at: '2026-04-22T12:00:00.000Z',
        },
      ],
      isLoading: false,
    });
    useSpinHistoryCountMock.mockReturnValue({
      data: 2,
    });

    renderWithProviders(renderSpinHistory({ canUseColoring: false }));

    expect(screen.getByText('Aurora Wolves')).toBeInTheDocument();
    expect(screen.queryByText('Garden Pages')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Books' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pages' })).not.toBeInTheDocument();
  });
});
