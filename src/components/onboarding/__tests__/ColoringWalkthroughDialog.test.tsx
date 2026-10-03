import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { authState, enabledVerticalsState, saveMutateAsync, markSeenMutate, posthogCapture } =
  vi.hoisted(() => ({
    authState: { user: { id: 'user-1' } as { id: string } | null },
    enabledVerticalsState: {
      diamond_painting: true,
      coloring_books: true,
      isLoading: false,
    },
    saveMutateAsync: vi.fn(),
    markSeenMutate: vi.fn(),
    posthogCapture: vi.fn(),
  }));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

vi.mock('@/hooks/useEnabledVerticals', () => ({
  useEnabledVerticals: () => enabledVerticalsState,
}));

vi.mock('@/hooks/mutations/useSaveVerticalToggles', () => ({
  useSaveVerticalToggles: () => ({
    mutateAsync: saveMutateAsync,
    isPending: false,
  }),
}));

vi.mock('@/hooks/mutations/useMarkColoringWalkthroughSeen', () => ({
  useMarkColoringWalkthroughSeen: () => ({
    mutate: markSeenMutate,
    isPending: false,
  }),
}));

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture: posthogCapture }),
}));

vi.mock('@/lib/notifications', () => ({
  notify: vi.fn(),
}));

import { ColoringWalkthroughDialog } from '../ColoringWalkthroughDialog';

const renderDialog = (open = true) => {
  const onClose = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={client}>
      <ColoringWalkthroughDialog open={open} onClose={onClose} />
    </QueryClientProvider>
  );
  return { ...utils, onClose };
};

describe('<ColoringWalkthroughDialog />', () => {
  beforeEach(() => {
    saveMutateAsync.mockReset().mockResolvedValue(undefined);
    markSeenMutate.mockReset();
    posthogCapture.mockReset();
    authState.user = { id: 'user-1' };
    enabledVerticalsState.diamond_painting = true;
    enabledVerticalsState.coloring_books = true;
    enabledVerticalsState.isLoading = false;
  });

  it('does not display walkthrough content when the dialog is closed', () => {
    renderDialog(false);
    expect(screen.queryByText(/Organize both of your crafts/i)).not.toBeInTheDocument();
  });

  it('shows the combined craft intro as step 1 when the dialog is open', () => {
    renderDialog();
    expect(screen.getByText(/Organize both of your crafts/i)).toBeInTheDocument();
    expect(screen.getByText(/Step 1 of 3/i)).toBeInTheDocument();
  });

  it('navigates Next from step 1 to step 2 and Back returns', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: /Show me how/i }));
    expect(screen.getByText(/Pick what you actually track/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Back$/i }));
    expect(screen.getByText(/Organize both of your crafts/i)).toBeInTheDocument();
  });

  it('saves vertical toggles when flipping coloring off while diamond stays on', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: /Show me how/i }));
    await user.click(screen.getByRole('button', { name: /^Next$/i }));

    const coloringSwitch = screen.getByRole('switch', { name: /Toggle coloring books tracker/i });
    await user.click(coloringSwitch);

    await waitFor(() => {
      expect(saveMutateAsync).toHaveBeenCalledWith({
        userId: 'user-1',
        verticals: { diamond_painting: true, coloring_books: false },
      });
    });
    expect(posthogCapture).toHaveBeenCalledWith(
      'vertical_preferences_updated',
      expect.objectContaining({ surface: 'walkthrough', changed_coloring: true })
    );
  });

  it('refuses to flip the last enabled tracker off and shows the warning', async () => {
    enabledVerticalsState.coloring_books = false;
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: /Show me how/i }));
    await user.click(screen.getByRole('button', { name: /^Next$/i }));

    const diamondSwitch = screen.getByRole('switch', { name: /Toggle diamond paintings tracker/i });
    expect(diamondSwitch).toBeDisabled();
    expect(saveMutateAsync).not.toHaveBeenCalled();
  });

  it('marks the walkthrough seen when "I\'m all set" is pressed on step 3', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: /Show me how/i }));
    await user.click(screen.getByRole('button', { name: /^Next$/i }));
    await user.click(screen.getByRole('button', { name: /I'm all set/i }));

    expect(markSeenMutate).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('marks the walkthrough seen when closed via Esc', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.keyboard('{Escape}');

    expect(markSeenMutate).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
