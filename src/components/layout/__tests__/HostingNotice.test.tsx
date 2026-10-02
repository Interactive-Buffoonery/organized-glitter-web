import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HostingNotice } from '../HostingNotice';

describe('HostingNotice', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stays dismissed after a remount when session storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'SecurityError');
    });

    const user = userEvent.setup();
    const { unmount } = render(<HostingNotice />);

    await user.click(screen.getByRole('button', { name: 'Close hosting notice' }));
    expect(screen.queryByRole('region', { name: 'Hosting update this weekend' })).toBeNull();

    unmount();
    render(<HostingNotice />);

    expect(screen.queryByRole('region', { name: 'Hosting update this weekend' })).toBeNull();
  });
});
