import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectByline, ProjectSpecStrip, StatusDatePrompt } from './ProjectDetailFacts';
import { getVisibleProjectDates } from './projectDetailDates';
import type { ProjectType } from '@/types/project';

vi.mock('@/hooks/useUserTimezone', () => ({ useUserTimezone: () => 'UTC' }));
const mutate = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/mutations/useProjectDetailMutations', () => ({
  useUpdateProjectDatesSectionMutation: () => ({ mutate, isPending: false }),
}));
const project: ProjectType = {
  id: 'kit',
  userId: 'owner',
  title: 'Moonlit Fox Garden',
  status: 'stash',
  createdAt: '',
  updatedAt: '',
};

describe('project detail facts', () => {
  it('keeps all four empty specs and opens only the selected field', () => {
    const edit = vi.fn();
    render(<ProjectSpecStrip project={project} onEdit={edit} />);
    expect(screen.getAllByText('Add')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Add drill shape' }));
    expect(edit).toHaveBeenCalledExactlyOnceWith('drillShape');
    expect(screen.getByText('size')).toBeVisible();
    expect(screen.getByText('drills')).toBeVisible();
    expect(screen.getByText('colors')).toBeVisible();
  });
  it('links the company to the kit and credits the artist', () => {
    render(
      <ProjectByline
        project={{
          ...project,
          company: 'Diamond Art Club',
          artist: 'Lena',
          sourceUrl: 'https://example.com/kit',
        }}
      />
    );
    expect(screen.getByRole('link', { name: /Diamond Art Club/ })).toHaveAttribute(
      'href',
      'https://example.com/kit'
    );
    expect(screen.getByText(/art by Lena/)).toBeVisible();
  });
  it('uses plain company text when there is no kit URL', () => {
    render(<ProjectByline project={{ ...project, company: 'Diamond Art Club' }} />);
    expect(screen.getByText('Diamond Art Club')).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
  it('shows only the next missing date alongside all saved dates', () => {
    expect(
      getVisibleProjectDates({
        ...project,
        datePurchased: '2026-01-12',
        dateStarted: '2026-03-04',
      }).map(date => date.key)
    ).toEqual(['datePurchased', 'dateReceived', 'dateStarted']);
    expect(getVisibleProjectDates(project).map(date => date.key)).toEqual(['datePurchased']);
    expect(
      getVisibleProjectDates({
        ...project,
        datePurchased: '2026-01-12',
        dateReceived: '2026-02-02',
        dateStarted: '2026-03-04',
      }).at(-1)?.addLabel
    ).toBe('add finish date');
  });
  it('prompts for a missing finish date and lets the user defer it', () => {
    render(<StatusDatePrompt project={{ ...project, status: 'completed' }} onPickDate={vi.fn()} />);
    expect(screen.getByText('Did you finish it today?')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByText('Did you finish it today?')).not.toBeInTheDocument();
  });
  it('saves today only to the implied missing date', () => {
    render(<StatusDatePrompt project={{ ...project, status: 'completed' }} onPickDate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Yes, today' }));
    expect(mutate).toHaveBeenCalledWith({
      projectId: 'kit',
      dateCompleted: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });
  it('never prompts over an existing finish date', () => {
    render(
      <StatusDatePrompt
        project={{ ...project, status: 'completed', dateCompleted: '2026-03-18' }}
        onPickDate={vi.fn()}
      />
    );
    expect(screen.queryByText('Did you finish it today?')).not.toBeInTheDocument();
  });
});
