import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMockProject, renderWithProviders } from '@/test-utils';
import ProjectsTable from '../ProjectsTable';

vi.mock('@/hooks/useProjectStatus', () => ({
  useProjectStatus: () => ({
    getStatusColor: () => 'bg-test text-white',
    getStatusLabel: (status: string) => status,
  }),
}));

describe('ProjectsTable', () => {
  it('renders project data in both mobile card and desktop table branches', () => {
    const project = createMockProject({
      id: 'project-1',
      title: 'Aurora Bloom',
      status: 'progress',
      company: 'Diamond Art Club',
      artist: 'Jane Artist',
      width: 40,
      height: 50,
      drillShape: 'square',
      dateReceived: '2026-04-10T00:00:00.000Z',
      datePurchased: '2026-04-01T00:00:00.000Z',
      dateStarted: '2026-04-15T00:00:00.000Z',
    });

    const { container } = renderWithProviders(
      <ProjectsTable
        projects={[project]}
        sortField="date_purchased"
        sortDirection="desc"
        onSort={vi.fn()}
        onNavigate={vi.fn()}
      />
    );

    // Title appears in both the mobile card and the desktop table row
    expect(screen.getAllByText('Aurora Bloom')).toHaveLength(2);
    // Artist now renders under the kit title (both mobile + desktop)
    expect(screen.getAllByText(/Jane Artist/).length).toBeGreaterThanOrEqual(1);
    // Size and shape label
    expect(screen.getAllByText(/40×50 · Square/).length).toBeGreaterThanOrEqual(1);

    // Responsive wrappers both present in the DOM
    expect(container.querySelector('.lg\\:hidden')).not.toBeNull();
    expect(container.querySelector('.hidden.lg\\:block')).not.toBeNull();
  });

  it('routes desktop title-button clicks through onNavigate', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const project = createMockProject({
      id: 'project-1',
      title: 'Aurora Bloom',
      status: 'progress',
    });

    renderWithProviders(
      <ProjectsTable
        projects={[project]}
        sortField="date_purchased"
        sortDirection="desc"
        onSort={vi.fn()}
        onNavigate={onNavigate}
      />
    );

    const desktopOpenButton = screen
      .getAllByRole('button', { name: 'Open project Aurora Bloom' })
      .find(button => button.closest('tr'));
    expect(desktopOpenButton).toBeTruthy();

    await user.click(desktopOpenButton!);

    expect(onNavigate).toHaveBeenCalledWith('project-1');
  });

  it('routes card clicks through onNavigate from the mobile card', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const project = createMockProject({
      id: 'project-1',
      title: 'Aurora Bloom',
      status: 'progress',
    });

    renderWithProviders(
      <ProjectsTable
        projects={[project]}
        sortField="date_purchased"
        sortDirection="desc"
        onSort={vi.fn()}
        onNavigate={onNavigate}
      />
    );

    const mobileCard = screen.getAllByRole('button', { name: 'Open project Aurora Bloom' }).at(-1);
    expect(mobileCard).toBeTruthy();

    await user.click(mobileCard!);

    expect(onNavigate).toHaveBeenCalledWith('project-1');
  });

  it('shows the lifecycle-appropriate date label per row, independent of sort', () => {
    const inProgress = createMockProject({
      id: 'project-progress',
      title: 'Night Garden',
      status: 'progress',
      dateStarted: '2026-04-15T00:00:00.000Z',
      datePurchased: '2026-01-01T00:00:00.000Z',
    });
    const completed = createMockProject({
      id: 'project-completed',
      title: 'Rose Garden',
      status: 'completed',
      dateCompleted: '2026-03-20T00:00:00.000Z',
      dateStarted: '2026-02-01T00:00:00.000Z',
    });

    renderWithProviders(
      <ProjectsTable
        projects={[inProgress, completed]}
        sortField="date_purchased"
        sortDirection="desc"
        onSort={vi.fn()}
        onNavigate={vi.fn()}
      />
    );

    // In-progress kit: "Started" label renders (both desktop + mobile)
    expect(screen.getAllByText(/Started/).length).toBeGreaterThanOrEqual(1);
    // Completed kit: "Finished" label renders
    expect(screen.getAllByText(/Finished/).length).toBeGreaterThanOrEqual(1);
  });

  it('sorts by kit name when the Kit header button is clicked', async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    const project = createMockProject({ id: 'project-1', title: 'Aurora Bloom' });

    renderWithProviders(
      <ProjectsTable
        projects={[project]}
        sortField="date_purchased"
        sortDirection="desc"
        onSort={onSort}
        onNavigate={vi.fn()}
      />
    );

    const kitHeader = screen
      .getAllByRole('button', { name: /kit/i })
      .find(el => el.closest('th') !== null);
    expect(kitHeader).toBeTruthy();

    await user.click(kitHeader!);

    expect(onSort).toHaveBeenCalledWith('kit_name', 'asc');
  });

  it('announces the active sort direction on its table header', () => {
    const project = createMockProject({ id: 'project-1', title: 'Aurora Bloom' });

    renderWithProviders(
      <ProjectsTable
        projects={[project]}
        sortField="kit_name"
        sortDirection="desc"
        onSort={vi.fn()}
        onNavigate={vi.fn()}
      />
    );

    const activeHeader = screen
      .getAllByRole('columnheader', { name: /kit/i })
      .find(header => header.closest('table'));
    expect(activeHeader).toHaveAttribute('aria-sort', 'descending');

    const inactiveHeader = screen
      .getAllByRole('columnheader', { name: /company/i })
      .find(header => header.closest('table'));
    expect(inactiveHeader).not.toHaveAttribute('aria-sort');
  });
});
