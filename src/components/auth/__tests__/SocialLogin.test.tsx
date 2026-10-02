import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { listConfiguredOAuthProvidersMock } = vi.hoisted(() => ({
  listConfiguredOAuthProvidersMock: vi.fn(),
}));

vi.mock('@/services/auth', () => ({
  listConfiguredOAuthProviders: listConfiguredOAuthProvidersMock,
  OAUTH_PROVIDER_LABELS: { apple: 'Apple', google: 'Google', discord: 'Discord' },
}));

import SocialLogin from '../SocialLogin';

describe('SocialLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Apple with the other configured providers and sends the selected provider', async () => {
    const onProviderLogin = vi.fn();
    const user = userEvent.setup();
    listConfiguredOAuthProvidersMock.mockResolvedValue(['apple', 'google', 'discord']);

    render(<SocialLogin onProviderLogin={onProviderLogin} />);

    await user.click(await screen.findByRole('button', { name: 'Apple' }));
    expect(onProviderLogin).toHaveBeenCalledWith('apple');
    expect(screen.getByRole('button', { name: 'Google' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discord' })).toBeInTheDocument();
  });

  it('does not render providers that PocketBase does not configure', async () => {
    listConfiguredOAuthProvidersMock.mockResolvedValue(['google']);

    render(<SocialLogin onProviderLogin={vi.fn()} />);

    expect(await screen.findByRole('button', { name: 'Google' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apple' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Discord' })).not.toBeInTheDocument();
  });

  it('shows a usable fallback when provider discovery fails', async () => {
    listConfiguredOAuthProvidersMock.mockRejectedValue(new Error('network'));

    render(<SocialLogin onProviderLogin={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Social sign-in is unavailable right now. Use email and password.'
      );
    });
  });
});
