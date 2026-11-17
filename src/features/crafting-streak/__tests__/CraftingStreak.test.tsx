import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  mode: 'home',
  isPhone: false,
  user: { id: 'one' },
  history: vi.fn(),
  mark: vi.fn(),
  unmark: vi.fn(),
  picker: vi.fn(),
}));
vi.mock('../useStreakMode', () => ({ useStreakMode: () => ({ mode: state.mode }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/hooks/useUserTimezone', () => ({ useUserTimezone: () => 'UTC' }));
vi.mock('@/hooks/use-mobile', () => ({ useMobileDevice: () => ({ isPhone: state.isPhone }) }));
vi.mock('@/services/pocketbase/craftingStreak.service', () => ({
  CraftingStreakService: { history: state.history, mark: state.mark, unmark: state.unmark },
}));
vi.mock('@/components/notes-feed/NoteTargetPicker', () => ({
  NoteTargetPicker: (props: { open: boolean; initialDate?: string }) => {
    state.picker(props);
    return props.open ? <div role="dialog" aria-label={`Note for ${props.initialDate}`} /> : null;
  },
}));
import { CraftingStreak } from '../CraftingStreak';

const empty = { noteDates: [], slots: [], marks: [] };
const show = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <CraftingStreak />
      </MemoryRouter>
    </QueryClientProvider>
  );
beforeEach(() => {
  Element.prototype.setPointerCapture ??= vi.fn();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-17T12:00:00Z'));
  state.mode = 'home';
  state.isPhone = false;
  state.history.mockReset();
  state.mark.mockReset();
  state.unmark.mockReset();
  state.picker.mockReset();
});
afterEach(() => vi.useRealTimers());

it('does not request or render anything when off', () => {
  state.mode = 'off';
  show();
  expect(state.history).not.toHaveBeenCalled();
  expect(screen.queryByLabelText(/crafting streak/i)).not.toBeInTheDocument();
});

it('invites a first streak without a week when nothing happened recently', async () => {
  state.history.mockResolvedValue(empty);
  show();
  const link = await screen.findByRole('link', { name: 'Start a crafting streak. Opens Notes.' });
  expect(link).toHaveAttribute('href', '/notes');
  expect(link).toHaveTextContent('Start a crafting streak');
  expect(screen.queryByRole('button', { name: /Options$/ })).not.toBeInTheDocument();
  expect(screen.getAllByRole('link')).toHaveLength(1);
});

it('shows the week ending today with each day described', async () => {
  state.history.mockResolvedValue({
    noteDates: ['2026-11-16'],
    slots: ['2026-11-15 10:00:00.000Z'],
    marks: [{ id: 'm1', day: '2026-11-13' }],
  });
  show();
  const link = await screen.findByRole('link', { name: '2-day crafting streak. Opens Notes.' });
  expect(link).toHaveTextContent('2 day streak');
  const days = screen.getAllByRole('button', { name: /Options$/ });
  expect(days.map(day => day.getAttribute('aria-label'))).toEqual([
    'Wednesday, November 11, missed. Options',
    'Thursday, November 12, missed. Options',
    'Friday, November 13, marked by you. Options',
    'Saturday, November 14, missed. Options',
    'Sunday, November 15, crafted. Options',
    'Monday, November 16, crafted. Options',
    'Tuesday, November 17, no activity yet. Options',
  ]);
  expect(screen.getAllByRole('link')).toHaveLength(1);
});

it('marks a missed day from its menu', async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  state.history.mockResolvedValue({ ...empty, noteDates: ['2026-11-16'] });
  state.mark.mockResolvedValue({ id: 'm2', day: '2026-11-15' });
  show();
  await user.click(
    await screen.findByRole('button', { name: 'Sunday, November 15, missed. Options' })
  );
  const menu = await screen.findByRole('menu');
  expect(within(menu).getByText('Sunday, November 15')).toBeInTheDocument();
  expect(within(menu).getByText('No activity this day')).toBeInTheDocument();
  expect(
    within(menu)
      .getAllByRole('menuitem')
      .map(item => item.textContent)
  ).toEqual(['Mark as a crafting day', 'Add a note for this day']);
  await user.click(within(menu).getByRole('menuitem', { name: 'Mark as a crafting day' }));
  expect(state.mark).toHaveBeenCalledWith('one', '2026-11-15');
});

it('unmarks a marked day and offers only notes for an activity day', async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  state.history.mockResolvedValue({
    ...empty,
    noteDates: ['2026-11-16'],
    marks: [{ id: 'm1', day: '2026-11-15' }],
  });
  show();
  await user.click(
    await screen.findByRole('button', { name: 'Sunday, November 15, marked by you. Options' })
  );
  let menu = await screen.findByRole('menu');
  expect(within(menu).getByText('Marked by you')).toBeInTheDocument();
  await user.click(within(menu).getByRole('menuitem', { name: 'Unmark this day' }));
  expect(state.unmark).toHaveBeenCalledWith('m1');

  await user.click(screen.getByRole('button', { name: 'Monday, November 16, crafted. Options' }));
  menu = await screen.findByRole('menu');
  expect(within(menu).getByText('Counted from your activity')).toBeInTheDocument();
  expect(
    within(menu)
      .getAllByRole('menuitem')
      .map(item => item.textContent)
  ).toEqual(['Add a note for this day']);
});

it('opens the note flow on the chosen day', async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  state.history.mockResolvedValue({ ...empty, noteDates: ['2026-11-16'] });
  show();
  await user.click(await screen.findByRole('button', { name: /^Sunday, November 15/ }));
  await user.click(await screen.findByRole('menuitem', { name: 'Add a note for this day' }));
  expect(await screen.findByRole('dialog', { name: 'Note for 2026-11-15' })).toBeInTheDocument();
});

it('uses a bottom sheet on phones', async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  state.isPhone = true;
  state.history.mockResolvedValue({ ...empty, noteDates: ['2026-11-16'] });
  state.mark.mockResolvedValue({ id: 'm2', day: '2026-11-15' });
  show();
  await user.click(await screen.findByRole('button', { name: /^Sunday, November 15/ }));
  const sheet = await screen.findByRole('dialog', { name: 'Sunday, November 15' });
  expect(within(sheet).getByText('No activity this day')).toBeInTheDocument();
  await user.click(within(sheet).getByRole('button', { name: 'Mark as a crafting day' }));
  expect(state.mark).toHaveBeenCalledWith('one', '2026-11-15');
});

it('never represents a failed read as zero', async () => {
  state.history.mockRejectedValue(new Error());
  show();
  await screen.findByLabelText('Crafting streak unavailable. Opens Notes.');
  expect(screen.queryByText(/Start a crafting streak/)).not.toBeInTheDocument();
});

it('keeps an in-flight read unknown', async () => {
  state.history.mockReturnValue(new Promise(() => {}));
  show();
  await waitFor(() =>
    expect(screen.getByLabelText('Crafting streak loading. Opens Notes.')).toBeInTheDocument()
  );
});
