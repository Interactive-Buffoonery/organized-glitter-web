import { vi } from 'vitest';
import { describe, it, expect, beforeEach } from '@/test-utils';
import { renderWithProviders, screen, waitFor, userEvent } from '@/test-utils';

const { mockToast } = vi.hoisted(() => ({
  mockToast: vi.fn(),
}));
vi.mock('@/lib/notifications', () => ({
  notify: mockToast,
  notifySuccess: mockToast,
  notifyWarning: mockToast,
  notifyError: mockToast,
  notifyInfo: mockToast,
}));

vi.mock('@/hooks/useUserTimezone', () => ({
  useUserTimezone: () => 'America/New_York',
}));

vi.mock('@/utils/date/timezoneUtils', () => ({
  getTimezonesByRegion: () => ({
    'north-america': [
      { label: 'Eastern Time - New York', value: 'America/New_York' },
      { label: 'Pacific Time - Los Angeles', value: 'America/Los_Angeles' },
    ],
    europe: [{ label: 'London', value: 'Europe/London' }],
  }),
  TIMEZONE_REGIONS: {
    'north-america': 'North America',
    europe: 'Europe',
  },
  detectUserTimezone: () => 'America/New_York',
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { TimezonePreferences } from '../TimezonePreferences';

describe('TimezonePreferences', () => {
  const mockOnTimezoneUpdate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // JSDOM doesn't implement Pointer Events; Radix Select calls these as it
    // captures the trigger's pointer. Stub them so click-driven select tests
    // can dispatch events without crashing inside the primitive.
    Element.prototype.hasPointerCapture ??= vi.fn(() => false);
    Element.prototype.setPointerCapture ??= vi.fn();
    Element.prototype.releasePointerCapture ??= vi.fn();
    Element.prototype.scrollIntoView ??= vi.fn();
  });

  describe('Rendering', () => {
    it('renders the inline label and select', () => {
      renderWithProviders(<TimezonePreferences onTimezoneUpdate={mockOnTimezoneUpdate} />);

      expect(screen.getByText('Time zone')).toBeInTheDocument();
      // The select trigger is a combobox with the active timezone as its value.
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('renders an info popover trigger and an Auto-detect button', () => {
      renderWithProviders(<TimezonePreferences onTimezoneUpdate={mockOnTimezoneUpdate} />);

      expect(screen.getByRole('button', { name: /how time zones work/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /auto-detect/i })).toBeInTheDocument();
    });

    it('shows the current timezone as the select value', () => {
      renderWithProviders(<TimezonePreferences onTimezoneUpdate={mockOnTimezoneUpdate} />);

      // Radix Select renders the active item label inside the combobox.
      expect(screen.getByRole('combobox')).toHaveTextContent('Eastern Time - New York');
    });
  });

  describe('Autosave on select change', () => {
    it('calls onTimezoneUpdate when the user picks a new timezone', async () => {
      const user = userEvent.setup();
      mockOnTimezoneUpdate.mockResolvedValue(undefined);
      renderWithProviders(<TimezonePreferences onTimezoneUpdate={mockOnTimezoneUpdate} />);

      await user.click(screen.getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: /pacific time/i }));

      await waitFor(() => {
        expect(mockOnTimezoneUpdate).toHaveBeenCalledWith('America/Los_Angeles');
      });
    });

    it('shows a success toast after a save', async () => {
      const user = userEvent.setup();
      mockOnTimezoneUpdate.mockResolvedValue(undefined);
      renderWithProviders(<TimezonePreferences onTimezoneUpdate={mockOnTimezoneUpdate} />);

      await user.click(screen.getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: /pacific time/i }));

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: 'success',
            title: 'Time zone updated',
          })
        );
      });
    });

    it('shows an error toast when the update fails', async () => {
      const user = userEvent.setup();
      mockOnTimezoneUpdate.mockRejectedValue(new Error('Network error'));
      renderWithProviders(<TimezonePreferences onTimezoneUpdate={mockOnTimezoneUpdate} />);

      await user.click(screen.getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: /pacific time/i }));

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: 'error',
            title: 'Update failed',
          })
        );
      });
    });

    it('does not save when picking the already-active timezone', async () => {
      const user = userEvent.setup();
      renderWithProviders(<TimezonePreferences onTimezoneUpdate={mockOnTimezoneUpdate} />);

      await user.click(screen.getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: /eastern time/i }));

      // Same value as the active timezone, so the component short-circuits.
      expect(mockOnTimezoneUpdate).not.toHaveBeenCalled();
    });
  });

  describe('Auto-detect', () => {
    it('shows an "already detected" toast when the browser zone matches the active one', async () => {
      const user = userEvent.setup();
      renderWithProviders(<TimezonePreferences onTimezoneUpdate={mockOnTimezoneUpdate} />);

      await user.click(screen.getByRole('button', { name: /auto-detect/i }));

      // detectUserTimezone() and useUserTimezone() both return 'America/New_York' in this mock,
      // so we surface a no-op toast instead of trying to persist the same value.
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Already detected',
        })
      );
      expect(mockOnTimezoneUpdate).not.toHaveBeenCalled();
    });
  });
});
