import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach, waitFor } from '../../../test-utils';

const { mockNotifySuccess } = vi.hoisted(() => ({
  mockNotifySuccess: vi.fn(),
}));

vi.mock('@/lib/notifications/notify', () => ({
  notifySuccess: mockNotifySuccess,
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    criticalError: vi.fn(),
  }),
}));

import { UpdateToast } from '../UpdateToast';

const BUILD_STORAGE_KEY = 'organized-glitter:build-id';

describe('UpdateToast', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('shows the update toast when the stored build id differs', async () => {
    window.localStorage.setItem(BUILD_STORAGE_KEY, 'older-build');
    render(<UpdateToast buildId="new-build" />);

    await waitFor(() => {
      expect(mockNotifySuccess).toHaveBeenCalledWith('Your app was updated!');
    });
    expect(window.localStorage.getItem(BUILD_STORAGE_KEY)).toBe('new-build');
  });

  it('does not show the toast on first visit (no stored build id)', async () => {
    render(<UpdateToast buildId="new-build" />);

    await waitFor(() => {
      expect(window.localStorage.getItem(BUILD_STORAGE_KEY)).toBe('new-build');
    });
    expect(mockNotifySuccess).not.toHaveBeenCalled();
  });

  it('does not show the toast when the build id is unchanged', async () => {
    window.localStorage.setItem(BUILD_STORAGE_KEY, 'same-build');
    render(<UpdateToast buildId="same-build" />);

    await waitFor(() => {
      expect(window.localStorage.getItem(BUILD_STORAGE_KEY)).toBe('same-build');
    });
    expect(mockNotifySuccess).not.toHaveBeenCalled();
  });

  it('does nothing when buildId is empty', async () => {
    window.localStorage.setItem(BUILD_STORAGE_KEY, 'older-build');
    render(<UpdateToast buildId="" />);

    await waitFor(() => {
      expect(mockNotifySuccess).not.toHaveBeenCalled();
    });
    // Empty buildId must not overwrite the stored id.
    expect(window.localStorage.getItem(BUILD_STORAGE_KEY)).toBe('older-build');
  });

  it('does not notify or throw when reading localStorage fails', async () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('localStorage unavailable');
    });
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    expect(() => render(<UpdateToast buildId="new-build" />)).not.toThrow();

    await waitFor(() => {
      expect(getItemSpy).toHaveBeenCalledWith(BUILD_STORAGE_KEY);
    });
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(mockNotifySuccess).not.toHaveBeenCalled();
  });

  it('shows the update toast when writing localStorage fails after a changed build id', async () => {
    window.localStorage.setItem(BUILD_STORAGE_KEY, 'older-build');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('localStorage write blocked');
    });

    render(<UpdateToast buildId="new-build" />);

    await waitFor(() => {
      expect(mockNotifySuccess).toHaveBeenCalledWith('Your app was updated!');
    });
    expect(setItemSpy).toHaveBeenCalledWith(BUILD_STORAGE_KEY, 'new-build');
    expect(window.localStorage.getItem(BUILD_STORAGE_KEY)).toBe('older-build');
  });
});
