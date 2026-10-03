import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectGridCard from '../ProjectGridCard';
import ProjectListRow from '../ProjectListRow';
import type { ProjectType } from '@/types/project';

vi.mock('@/hooks/useProjectStatus', () => ({
  useProjectStatus: () => ({
    getStatusColor: () => '',
    getStatusLabel: (s: string) => s,
  }),
}));

vi.mock('@/utils/logger', () => ({
  logger: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createLogger: () => ({
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const mockProject: ProjectType = {
  id: 'test-project-id',
  userId: 'test-user',
  title: 'Test Project',
  status: 'progress',
  kitCategory: 'full',
  drillShape: 'round',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('ProjectGridCard', () => {
  it('calls onNavigate with project id when clicked', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(<ProjectGridCard project={mockProject} onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: 'Open project Test Project' }));

    expect(onNavigate).toHaveBeenCalledWith('test-project-id');
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('supports keyboard activation', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(<ProjectGridCard project={mockProject} onNavigate={onNavigate} />);

    const card = screen.getByRole('button', { name: 'Open project Test Project' });
    card.focus();
    await user.keyboard('{Enter}');

    expect(onNavigate).toHaveBeenCalledWith('test-project-id');
  });

  it('falls back to onClick when onNavigate is not provided', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(<ProjectGridCard project={mockProject} onClick={onClick} />);

    await user.click(screen.getByRole('button', { name: 'Open project Test Project' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders sort-aware metadata line content', () => {
    const richProject: ProjectType = {
      ...mockProject,
      company: 'Diamond Art Club',
      artist: 'Iris Scott',
      width: 40,
      height: 50,
      datePurchased: '2026-03-15T00:00:00Z',
    };

    const { rerender } = render(<ProjectGridCard project={richProject} sortField="last_updated" />);
    expect(screen.getByTestId('grid-metadata-line').textContent).toMatch(/2026/);

    rerender(<ProjectGridCard project={richProject} sortField="company" />);
    expect(screen.getByTestId('grid-metadata-line').textContent).toBe('Diamond Art Club');

    rerender(<ProjectGridCard project={richProject} sortField="artist" />);
    expect(screen.getByTestId('grid-metadata-line').textContent).toBe('Iris Scott');

    rerender(<ProjectGridCard project={richProject} sortField="width" />);
    expect(screen.getByTestId('grid-metadata-line').textContent).toBe('40×50');
  });
});

describe('ProjectListRow', () => {
  const richProject: ProjectType = {
    ...mockProject,
    title: 'Autumn Cottage',
    status: 'purchased',
    company: 'Diamond Art Club',
    artist: 'Iris Scott',
    width: 40,
    height: 50,
    datePurchased: '2026-03-15T00:00:00Z',
  };

  it('calls onNavigate with project id when clicked', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(<ProjectListRow project={mockProject} onNavigate={onNavigate} />);

    await user.click(screen.getByRole('link', { name: /Open project Test Project/ }));

    expect(onNavigate).toHaveBeenCalledWith('test-project-id');
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('uses native link keyboard activation', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(<ProjectListRow project={mockProject} onNavigate={onNavigate} />);

    const rowAction = screen.getByRole('link', { name: /Open project Test Project/ });
    rowAction.focus();
    await user.keyboard('{Enter}');

    expect(onNavigate).toHaveBeenCalledWith('test-project-id');
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('keeps list semantics while exposing the row action as a link', () => {
    render(<ProjectListRow project={mockProject} />);

    const row = screen.getByRole('listitem');
    const rowAction = screen.getByRole('link', { name: /Open project Test Project/ });

    expect(row).toContainElement(rowAction);
    expect(rowAction).toHaveAttribute('href', '/projects/test-project-id');
    expect(row).not.toHaveAttribute('tabIndex');
    expect(row).not.toHaveAttribute('aria-label');
  });

  it('shows company, artist, size, shape, and lifecycle date', () => {
    render(<ProjectListRow project={richProject} />);

    expect(screen.getByText(/Diamond Art Club · Iris Scott/)).toBeInTheDocument();
    expect(screen.getByText(/40×50 · Round/)).toBeInTheDocument();
    expect(screen.getAllByText(/Purchased/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it('exposes key metadata in the link aria-label', () => {
    render(<ProjectListRow project={richProject} />);

    const rowAction = screen.getByRole('link', { name: /Open project Autumn Cottage/ });
    const label = rowAction.getAttribute('aria-label') ?? '';

    expect(label).toMatch(/Open project Autumn Cottage/);
    expect(label).toMatch(/Autumn Cottage/);
    expect(label).toMatch(/Diamond Art Club/);
    expect(label).toMatch(/Iris Scott/);
    expect(label).toMatch(/40×50/);
    expect(label).toMatch(/Purchased/);
  });
});
