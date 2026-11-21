import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DetailSpecStrip } from '../DetailSpecStrip';
import { ColoringPageDateLine } from '../ColoringPageDateLine';
import DetailJournalThread from '../DetailJournalThread';
import { FinishDatePrompt } from '../FinishDatePrompt';
import { ColoringPageDetailHeader } from '../ColoringPageDetailHeader';
import { ColoringPageCommandPanel } from '../ColoringPageCommandPanel';
import { useColoringPageLifecycleDates } from '@/hooks/coloring/useColoringPageLifecycleDates';
import { useColoringPageMediumSelection } from '@/hooks/coloring/useColoringPageMediumSelection';
import { useColoringPageMysteryReveal } from '@/hooks/coloring/useColoringPageMysteryReveal';
import { useColoringPageStatusAction } from '@/hooks/coloring/useColoringPageStatusAction';
import type { ColoringBookDTO, ColoringPageDTO } from '@/services/pocketbase/coloring.service';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/queries/coloring/useColorKeys', () => ({ useColorKeys: () => ({}) }));

const noMediums: string[] = [];

function CommandPanelWithDates({
  status,
  startedAt,
  completedAt,
}: Pick<ColoringPageDTO, 'status' | 'startedAt' | 'completedAt'>) {
  const page: ColoringPageDTO = {
    id: 'page',
    bookId: 'book',
    pageNumber: 7,
    photos: [],
    mediumIds: noMediums,
    revealedSubject: '',
    revealedAt: '',
    createdAt: '',
    updatedAt: '',
    status,
    startedAt,
    completedAt,
  };
  const executor = { isPending: false, execute: vi.fn() };
  const userTimezone = 'America/New_York';
  return (
    <ColoringPageCommandPanel
      page={page}
      book={{ id: 'book', title: 'Book', totalPages: 30 } as ColoringBookDTO}
      mediums={[]}
      isMediumsLoading={false}
      userTimezone={userTimezone}
      statusAction={useColoringPageStatusAction(page, executor)}
      lifecycleDates={useColoringPageLifecycleDates(page, userTimezone, executor)}
      mediumSelection={useColoringPageMediumSelection(page, executor)}
      mysteryReveal={useColoringPageMysteryReveal(page, executor)}
      returnTo="/coloring-books"
      editOpen={false}
      onEditOpenChange={vi.fn()}
      onPhotos={vi.fn()}
    />
  );
}

describe('Coloring page detail redesign', () => {
  it.each([
    ['2026-03-07', 'Finished same day'],
    ['2026-03-08', 'Finished in 1 day'],
    ['2026-03-09', 'Finished in 2 days'],
  ])('shows elapsed days for a page finished on %s', (completedAt, label) => {
    render(
      <MemoryRouter>
        <CommandPanelWithDates
          status="completed"
          startedAt="2026-03-07"
          completedAt={completedAt}
        />
      </MemoryRouter>
    );
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('keeps counting from Day 1 for an in-progress page in the account timezone', () => {
    vi.setSystemTime(new Date('2026-03-08T02:00:00Z'));
    try {
      render(
        <MemoryRouter>
          <CommandPanelWithDates status="in_progress" startedAt="2026-03-07" completedAt="" />
        </MemoryRouter>
      );
      expect(screen.getByText('Day 1')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('offers Add for every empty spec and invokes its action', async () => {
    const action = vi.fn();
    render(
      <DetailSpecStrip
        items={['medium', 'colors', 'photos'].map(label => ({
          id: label,
          label,
          onClick: action,
        }))}
      />
    );
    expect(screen.getAllByText('Add')).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: 'Add medium' }));
    expect(action).toHaveBeenCalledOnce();
  });

  it('keeps keyboard focus on the photo spec as the count changes', async () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <DetailSpecStrip items={[{ id: 'photos', label: 'photo', value: '1', onClick }]} />
    );
    const button = screen.getByRole('button', { name: '1 photo' });
    await userEvent.tab();
    expect(button).toHaveFocus();

    rerender(<DetailSpecStrip items={[{ id: 'photos', label: 'photos', value: '2', onClick }]} />);
    expect(screen.getByRole('button', { name: '2 photos' })).toBe(button);
    expect(button).toHaveFocus();

    rerender(<DetailSpecStrip items={[{ id: 'photos', label: 'photo', value: '1', onClick }]} />);
    expect(screen.getByRole('button', { name: '1 photo' })).toBe(button);
    expect(button).toHaveFocus();
  });

  it.each([
    ['', '', 'add start date', 'add finish date'],
    ['2026-10-17', '', 'add finish date', 'add start date'],
    ['', '2026-10-24', 'add start date', 'add finish date'],
  ])('shows only the next missing date (%s, %s)', (startedAt, completedAt, next, hidden) => {
    render(
      <ColoringPageDateLine
        startedAt={startedAt}
        completedAt={completedAt}
        revealedAt="2026-10-20"
        userTimezone="UTC"
        onEdit={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: next })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: hidden })).toBeNull();
    expect(screen.getByText(/Revealed/)).toBeInTheDocument();
  });

  it('shows both set dates without an add link and allows editing', async () => {
    const edit = vi.fn();
    render(
      <ColoringPageDateLine
        startedAt="2026-10-17"
        completedAt="2026-10-24"
        userTimezone="UTC"
        onEdit={edit}
      />
    );
    expect(screen.queryByText(/add .* date/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Started/ }));
    expect(edit).toHaveBeenCalledWith('startedAt');
  });

  it('shows the finish prompt only for completed pages without a date', () => {
    const props = { onToday: vi.fn(), onPickDate: vi.fn() };
    const { rerender } = render(
      <FinishDatePrompt status="in_progress" completedAt="" {...props} />
    );
    expect(screen.queryByText('Did you finish it today?')).toBeNull();
    rerender(<FinishDatePrompt status="completed" completedAt="2026-10-24" {...props} />);
    expect(screen.queryByText('Did you finish it today?')).toBeNull();
    rerender(<FinishDatePrompt status="completed" completedAt="" {...props} />);
    expect(screen.getByText('Did you finish it today?')).toBeInTheDocument();
  });

  it('supports today, picking a date and dismissing the prompt', async () => {
    const today = vi.fn();
    const pick = vi.fn();
    render(
      <FinishDatePrompt status="completed" completedAt="" onToday={today} onPickDate={pick} />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Yes, today' }));
    expect(today).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Pick a date' }));
    expect(pick).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByText('Did you finish it today?')).toBeNull();
  });

  it('uses the revealed subject as its single title and keeps book context', () => {
    render(
      <MemoryRouter>
        <ColoringPageDetailHeader
          book={
            {
              id: 'book',
              title: 'Mystery Patterns',
              illustratorName: 'An illustrator',
              totalPages: 30,
            } as ColoringBookDTO
          }
          page={{ pageNumber: 7, revealedSubject: 'A sleeping owl' } as ColoringPageDTO}
        />
      </MemoryRouter>
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('A sleeping owl');
    expect(screen.getByRole('link', { name: 'Mystery Patterns' })).toBeInTheDocument();
    expect(screen.getByText('An illustrator')).toBeInTheDocument();
    expect(screen.getByText('7 of 30')).toBeInTheDocument();
  });

  it('renders date-only journal entries without shifting the day', () => {
    render(
      <DetailJournalThread
        progressNotes={[
          {
            id: 'note',
            projectId: 'page',
            content: 'Picked two greens.',
            date: '2026-10-24',
            createdAt: '',
            updatedAt: '',
          },
        ]}
      />
    );
    expect(screen.getByText('Oct 24')).toBeInTheDocument();
    expect(screen.getByText('Picked two greens.')).toBeInTheDocument();
    expect(document.querySelector('time')).toHaveAttribute('dateTime', '2026-10-24');
  });

  it('uses Page N before reveal', () => {
    render(
      <MemoryRouter>
        <ColoringPageDetailHeader
          book={{ id: 'book', title: 'Book', totalPages: 30 } as ColoringBookDTO}
          page={{ pageNumber: 7, revealedSubject: '' } as ColoringPageDTO}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Page 7');
  });
});
