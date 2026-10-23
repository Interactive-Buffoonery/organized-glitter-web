import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsPreference } from '@/components/profile/AnalyticsPreference';
import {
  getAnalyticsPreference,
  initializeAnalyticsPreference,
} from '@/services/analytics-preference';

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
    subscribeRealtimeConnect: async () => async () => {},
  },
}));

let stop: (() => void) | undefined;
beforeEach(() => {
  stop?.();
  vi.clearAllMocks();
  localStorage.clear();
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
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function renderPreference() {
  stop = initializeAnalyticsPreference();
  render(<AnalyticsPreference />);
  const control = screen.getByRole('switch', { name: 'Usage analytics' });
  await waitFor(() => expect(control).toBeEnabled());
  return control;
}

describe('account analytics preference', () => {
  it('does not write a choice on a failed load', async () => {
    mocks.get.mockRejectedValue(new Error('offline'));
    stop = initializeAnalyticsPreference();
    await waitFor(() => expect(getAnalyticsPreference().loadFailed).toBe(true));
    expect(localStorage.getItem('og:analytics:account-consent')).toBeNull();
  });

  it('persists a pending opt-out before confirmation', async () => {
    const control = await renderPreference();
    mocks.update.mockImplementation(() => new Promise(() => {}));
    fireEvent.click(control);
    expect(JSON.parse(localStorage.getItem('og:analytics:account-consent')!).enabled).toBe(false);
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

  it('keeps tracking and the control off when the preference cannot be loaded', async () => {
    mocks.get.mockRejectedValue(new Error('offline'));
    stop = initializeAnalyticsPreference();
    render(<AnalyticsPreference />);
    await waitFor(() => expect(mocks.get).toHaveBeenCalled());
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.getByRole('switch')).not.toBeChecked();
  });
});
