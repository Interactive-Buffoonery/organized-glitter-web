import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountThemeSync } from './AccountThemeSync';

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  profile: undefined as { themePreference?: string } | undefined,
  setTheme: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: state.user, isLoading: false }),
}));
vi.mock('@/hooks/queries/useUserProfileQuery', () => ({
  useUserProfileQuery: () => ({ data: state.profile }),
}));
vi.mock('next-themes', () => ({
  useTheme: () => ({ setTheme: state.setTheme }),
}));

describe('AccountThemeSync', () => {
  beforeEach(() => {
    state.user = null;
    state.profile = undefined;
    state.setTheme.mockClear();
  });

  it('leaves the visitor theme alone while logged out', () => {
    render(<AccountThemeSync />);
    expect(state.setTheme).not.toHaveBeenCalled();
  });

  it('switches to System on login when the account has no saved preference', () => {
    const { rerender } = render(<AccountThemeSync />);
    state.user = { id: 'user-a' };
    state.profile = {};
    rerender(<AccountThemeSync />);
    expect(state.setTheme).toHaveBeenCalledWith('system');
  });

  it.each(['light', 'dark', 'system'])('honors the saved %s account preference', theme => {
    state.user = { id: 'user-a' };
    state.profile = { themePreference: theme };
    render(<AccountThemeSync />);
    expect(state.setTheme).toHaveBeenCalledWith(theme);
  });

  it('restores the account preference after a visitor changes theme between sessions', () => {
    state.user = { id: 'user-a' };
    state.profile = { themePreference: 'system' };
    const { rerender } = render(<AccountThemeSync />);
    state.user = null;
    state.profile = undefined;
    rerender(<AccountThemeSync />);
    state.setTheme('light');
    state.setTheme.mockClear();

    state.user = { id: 'user-a' };
    state.profile = { themePreference: 'system' };
    rerender(<AccountThemeSync />);
    expect(state.setTheme).toHaveBeenCalledWith('system');
  });
});
