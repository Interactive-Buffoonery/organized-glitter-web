import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ mode: 'home', user: { id: 'one' }, dates: vi.fn() }));
vi.mock('../useStreakMode', () => ({ useStreakMode: () => ({ mode: state.mode }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/hooks/useUserTimezone', () => ({ useUserTimezone: () => 'UTC' }));
vi.mock('@/services/pocketbase/craftingStreak.service', () => ({
  CraftingStreakService: { dates: state.dates },
}));
import { CraftingStreak } from '../CraftingStreak';
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
  state.mode = 'home';
  state.dates.mockReset();
});
it('does not request or render anything when off', () => {
  state.mode = 'off';
  show();
  expect(state.dates).not.toHaveBeenCalled();
  expect(screen.queryByLabelText(/crafting streak/i)).not.toBeInTheDocument();
});
it('shows zero as an outline link to Notes', async () => {
  state.dates.mockResolvedValue([]);
  show();
  const link = await screen.findByRole('link', {
    name: 'No current crafting streak. Opens Notes.',
  });
  expect(link).toHaveAttribute('href', '/notes');
  expect(link.querySelector('svg')).toHaveAttribute('fill', 'none');
  expect(link.textContent).toBe('');
});
it('never represents a failed read as zero', async () => {
  state.dates.mockRejectedValue(new Error());
  show();
  await screen.findByLabelText('Crafting streak unavailable. Opens Notes.');
  expect(screen.queryByLabelText(/No current/)).not.toBeInTheDocument();
});
it('keeps an in-flight read unknown', async () => {
  state.dates.mockReturnValue(new Promise(() => {}));
  show();
  await waitFor(() =>
    expect(screen.getByLabelText('Crafting streak loading. Opens Notes.')).toBeInTheDocument()
  );
});
