import { vi } from 'vitest';
import {
  beforeEach,
  describe,
  expect,
  it,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from '@/test-utils';

const { setThemeMock, notifyMock } = vi.hoisted(() => ({
  setThemeMock: vi.fn(),
  notifyMock: vi.fn(),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({
    setTheme: setThemeMock,
  }),
}));

vi.mock('@/lib/notifications', () => ({
  notify: notifyMock,
}));

import { ThemePreferences } from '../ThemePreferences';

describe('ThemePreferences', () => {
  const onThemeUpdate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders only the system, light, and dark themes', () => {
    renderWithProviders(
      <ThemePreferences currentThemePreference="system" onThemeUpdate={onThemeUpdate} />
    );

    expect(screen.getByRole('radio', { name: /System/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Light/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Dark/ })).toBeInTheDocument();
    expect(screen.queryByText(/Catppuccin themes/i)).not.toBeInTheDocument();
  });

  it('persists the chosen theme on click and previews it immediately', async () => {
    const user = userEvent.setup();
    onThemeUpdate.mockResolvedValue(undefined);

    renderWithProviders(
      <ThemePreferences currentThemePreference="system" onThemeUpdate={onThemeUpdate} />
    );

    await user.click(screen.getByRole('radio', { name: /^Dark/ }));

    await waitFor(() => {
      expect(setThemeMock).toHaveBeenCalledWith('dark');
      expect(onThemeUpdate).toHaveBeenCalledWith('dark');
      expect(notifyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'success',
          title: 'Theme updated',
        })
      );
    });
  });

  it('rolls back the optimistic theme on save failure without surfacing the error', async () => {
    const user = userEvent.setup();
    onThemeUpdate.mockRejectedValue(new Error('network down'));

    renderWithProviders(
      <ThemePreferences currentThemePreference="light" onThemeUpdate={onThemeUpdate} />
    );

    await user.click(screen.getByRole('radio', { name: /^Dark/ }));

    await waitFor(() => {
      expect(onThemeUpdate).toHaveBeenCalledWith('dark');
      // Optimistic preview was applied first, then rolled back to the prior
      // server-known value when the mutation rejected.
      expect(setThemeMock).toHaveBeenNthCalledWith(1, 'dark');
      expect(setThemeMock).toHaveBeenLastCalledWith('light');
    });

    // The mutation hook owns user-facing error feedback; the form should not
    // also fire a success notification when the save rejected.
    expect(notifyMock).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }));
  });

  it('ignores re-clicks on the already-selected segmented option', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <ThemePreferences currentThemePreference="light" onThemeUpdate={onThemeUpdate} />
    );

    await user.click(screen.getByRole('radio', { name: /^Light/ }));

    expect(onThemeUpdate).not.toHaveBeenCalled();
    expect(setThemeMock).not.toHaveBeenCalled();
  });
});
