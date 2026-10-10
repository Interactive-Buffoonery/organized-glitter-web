import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsPreference } from '@/components/profile/AnalyticsPreference';
import { initializeAnalyticsPreference } from '@/services/analytics-preference';

const mocks = vi.hoisted(() => ({
  user: { id: 'account-a' } as { id: string } | null,
  get: vi.fn(),
  update: vi.fn(),
  subscribe: vi.fn(),
  authCallback: undefined as undefined | (() => void),
  remoteCallback: undefined as undefined | ((optOut: boolean) => void),
}));
vi.mock('@/services/auth', () => ({
  getCurrentUser: () => mocks.user,
  onAuthChange: (callback: () => void) => {
    mocks.authCallback = callback;
    callback();
    return () => {};
  },
}));
vi.mock('@/services/pocketbase/users.service', () => ({
  UsersService: {
    getAnalyticsOptOut: mocks.get,
    updateAnalyticsOptOut: mocks.update,
    subscribeAnalyticsPreference: mocks.subscribe,
  },
}));

let stop: (() => void) | undefined;
beforeEach(() => {
  stop?.();
  vi.clearAllMocks();
  mocks.user = { id: 'account-a' };
  mocks.get.mockResolvedValue(false);
  mocks.update.mockResolvedValue(true);
  mocks.subscribe.mockImplementation(async (_id, callback) => {
    mocks.remoteCallback = callback;
    return async () => {};
  });
});

afterEach(() => {
  stop?.();
  stop = undefined;
});

async function renderPreference() {
  stop = initializeAnalyticsPreference();
  render(<AnalyticsPreference />);
  const control = screen.getByRole('switch', { name: 'Usage analytics' });
  await waitFor(() => expect(control).toBeEnabled());
  return control;
}

describe('account analytics preference', () => {
  it('waits for the server, then saves the choice on the account', async () => {
    const control = await renderPreference();
    expect(control).toBeChecked();
    fireEvent.click(control);
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith('account-a', true));
    await waitFor(() => expect(control).toBeEnabled());
    expect(control).not.toBeChecked();
    expect(screen.getByText(/saved to your account/i)).toBeInTheDocument();
  });

  it('shows a save error and restores the confirmed choice', async () => {
    mocks.update.mockRejectedValue(new Error('offline'));
    const control = await renderPreference();
    fireEvent.click(control);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
    expect(control).toBeChecked();
  });

  it('reconciles a failed save when the server applied the opt-out', async () => {
    const control = await renderPreference();
    mocks.update.mockRejectedValue(new Error('response lost'));
    mocks.get.mockResolvedValue(true);
    fireEvent.click(control);
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    await waitFor(() => expect(control).toBeEnabled());
    expect(control).not.toBeChecked();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears the save warning when a later refresh confirms the requested choice', async () => {
    const control = await renderPreference();
    mocks.update.mockRejectedValue(new Error('response lost'));
    mocks.get.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(control);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
    mocks.get.mockResolvedValue(true);
    act(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(control).toBeEnabled());
    expect(control).not.toBeChecked();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('applies an opt-out received from another device', async () => {
    const control = await renderPreference();
    act(() => mocks.remoteCallback?.(true));
    expect(control).not.toBeChecked();
  });

  it('does not copy the previous account choice to another account', async () => {
    const control = await renderPreference();
    mocks.get.mockResolvedValue(true);
    act(() => {
      mocks.user = { id: 'account-b' };
      mocks.authCallback?.();
    });
    expect(control).toBeDisabled();
    await waitFor(() => expect(control).toBeEnabled());
    expect(control).not.toBeChecked();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('ignores a save response after switching accounts', async () => {
    let resolveSave!: (optOut: boolean) => void;
    mocks.update.mockImplementation(
      () =>
        new Promise<boolean>(resolve => {
          resolveSave = resolve;
        })
    );
    const control = await renderPreference();
    fireEvent.click(control);
    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    act(() => {
      mocks.user = { id: 'account-b' };
      mocks.authCallback?.();
    });
    await waitFor(() => expect(control).toBeEnabled());
    await act(async () => resolveSave(true));
    expect(control).toBeChecked();
  });

  it('ignores a read started before a same-account auth refresh', async () => {
    let resolveOldRead!: (optOut: boolean) => void;
    mocks.get.mockImplementationOnce(
      () =>
        new Promise<boolean>(resolve => {
          resolveOldRead = resolve;
        })
    );
    stop = initializeAnalyticsPreference();
    render(<AnalyticsPreference />);
    const control = screen.getByRole('switch');
    mocks.get.mockResolvedValue(true);
    act(() => mocks.authCallback?.());
    await waitFor(() => expect(control).toBeEnabled());
    await act(async () => resolveOldRead(false));
    expect(control).not.toBeChecked();
  });

  it('keeps tracking and the control off when the preference cannot be loaded', async () => {
    mocks.get.mockRejectedValue(new Error('offline'));
    stop = initializeAnalyticsPreference();
    render(<AnalyticsPreference />);
    await waitFor(() => expect(mocks.get).toHaveBeenCalled());
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.getByRole('switch')).not.toBeChecked();
  });
});
