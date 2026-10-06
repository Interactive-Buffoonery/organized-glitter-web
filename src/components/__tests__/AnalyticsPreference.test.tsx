import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import posthog from 'posthog-js';
import { AnalyticsPreference } from '@/components/profile/AnalyticsPreference';
import { ANALYTICS_PREFERENCE_KEY, setAnalyticsEnabled } from '@/services/analytics-preference';

describe('analytics preference', () => {
  beforeEach(() => {
    window.localStorage.removeItem(ANALYTICS_PREFERENCE_KEY);
    setAnalyticsEnabled(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    setAnalyticsEnabled(true);
  });

  it('defaults on and saves the user choice across remounts', () => {
    const view = render(<AnalyticsPreference />);
    const control = screen.getByRole('switch', { name: 'Usage analytics' });
    expect(control).toBeChecked();
    fireEvent.click(control);
    expect(control).not.toBeChecked();
    expect(window.localStorage.getItem(ANALYTICS_PREFERENCE_KEY)).toBe('false');
    view.unmount();
    render(<AnalyticsPreference />);
    expect(screen.getByRole('switch', { name: 'Usage analytics' })).not.toBeChecked();
  });

  it('applies a choice from another tab immediately', () => {
    const optOut = vi.spyOn(posthog, 'opt_out_capturing');
    const originalToken = posthog.config.token;
    posthog.config.token = 'synthetic-token';
    render(<AnalyticsPreference />);
    act(() => {
      window.localStorage.setItem(ANALYTICS_PREFERENCE_KEY, 'false');
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: ANALYTICS_PREFERENCE_KEY,
          newValue: 'false',
          storageArea: window.localStorage,
        })
      );
    });
    expect(screen.getByRole('switch', { name: 'Usage analytics' })).not.toBeChecked();
    expect(optOut).toHaveBeenCalled();
    posthog.config.token = originalToken;
  });

  it('keeps a new choice when reading storage works but saving fails', () => {
    window.localStorage.setItem(ANALYTICS_PREFERENCE_KEY, 'true');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    render(<AnalyticsPreference />);
    fireEvent.click(screen.getByRole('switch', { name: 'Usage analytics' }));
    expect(screen.getByRole('switch', { name: 'Usage analytics' })).not.toBeChecked();
  });

  it('keeps the choice for this session when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<AnalyticsPreference />);
    fireEvent.click(screen.getByRole('switch', { name: 'Usage analytics' }));
    expect(screen.getByRole('switch', { name: 'Usage analytics' })).not.toBeChecked();
  });
});
