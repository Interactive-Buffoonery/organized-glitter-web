import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const {
  connectOAuthProviderMock,
  listAccountSignInMethodsMock,
  requestOAuthSignInMethodProofMock,
  requestPasswordSignInMethodProofMock,
  unlinkOAuthProviderMock,
  notifyMock,
} = vi.hoisted(() => ({
  connectOAuthProviderMock: vi.fn(),
  listAccountSignInMethodsMock: vi.fn(),
  requestOAuthSignInMethodProofMock: vi.fn(),
  requestPasswordSignInMethodProofMock: vi.fn(),
  unlinkOAuthProviderMock: vi.fn(),
  notifyMock: vi.fn(),
}));

vi.mock('@/services/auth', () => ({
  connectOAuthProvider: connectOAuthProviderMock,
  listAccountSignInMethods: listAccountSignInMethodsMock,
  requestOAuthSignInMethodProof: requestOAuthSignInMethodProofMock,
  requestPasswordSignInMethodProof: requestPasswordSignInMethodProofMock,
  unlinkOAuthProvider: unlinkOAuthProviderMock,
}));

vi.mock('@/lib/notifications', () => ({ notify: notifyMock }));
vi.mock('@/utils/logger', () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

import { SignInMethods } from '../SignInMethods';

const proof = (action: 'link' | 'unlink', targetProvider: 'apple' | 'google') => ({
  action,
  authToken: 'token',
  targetProvider,
  userId: 'user-1',
  value: 'fresh-proof',
});

describe('SignInMethods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAccountSignInMethodsMock.mockResolvedValue([
      { provider: 'apple', label: 'Apple', configured: true, linked: false },
      { provider: 'google', label: 'Google', configured: true, linked: true },
    ]);
  });

  it('requires password verification and a second click before connecting', async () => {
    const user = userEvent.setup();
    const linkProof = proof('link', 'apple');
    requestPasswordSignInMethodProofMock.mockResolvedValue({ success: true, proof: linkProof });
    connectOAuthProviderMock.mockResolvedValue({ success: true });

    render(<SignInMethods userId="user-1" />);
    await user.click(await screen.findByRole('button', { name: 'Connect Apple' }));
    await user.type(screen.getByLabelText('Current password'), 'known-password');
    await user.click(screen.getByRole('button', { name: 'Verify with password' }));
    await user.click(await screen.findByRole('button', { name: 'Connect Apple' }));

    await waitFor(() => {
      expect(requestPasswordSignInMethodProofMock).toHaveBeenCalledWith(
        'known-password',
        'link',
        'apple',
        'user-1'
      );
      expect(connectOAuthProviderMock).toHaveBeenCalledWith('apple', 'user-1', linkProof);
      expect(notifyMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Apple connected' })
      );
    });
  });

  it('shows an explicit account conflict after fresh verification', async () => {
    const user = userEvent.setup();
    requestPasswordSignInMethodProofMock.mockResolvedValue({
      success: true,
      proof: proof('link', 'apple'),
    });
    connectOAuthProviderMock.mockResolvedValue({
      success: false,
      conflict: true,
      error: 'This Apple account is already linked to another Organized Glitter account.',
    });

    render(<SignInMethods userId="user-1" />);
    await user.click(await screen.findByRole('button', { name: 'Connect Apple' }));
    await user.type(screen.getByLabelText('Current password'), 'known-password');
    await user.click(screen.getByRole('button', { name: 'Verify with password' }));
    await user.click(await screen.findByRole('button', { name: 'Connect Apple' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('already linked to another');
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('supports OAuth-only verification before unlinking', async () => {
    const user = userEvent.setup();
    const unlinkProof = proof('unlink', 'google');
    requestOAuthSignInMethodProofMock.mockResolvedValue({ success: true, proof: unlinkProof });
    unlinkOAuthProviderMock.mockResolvedValue({ success: true });

    render(<SignInMethods userId="user-1" />);
    await user.click(await screen.findByRole('button', { name: 'Unlink Google' }));
    await user.click(screen.getByRole('button', { name: 'Verify with Google' }));
    await user.click(await screen.findByRole('button', { name: 'Unlink sign-in method' }));

    await waitFor(() => {
      expect(requestOAuthSignInMethodProofMock).toHaveBeenCalledWith(
        'google',
        'unlink',
        'google',
        'user-1'
      );
      expect(unlinkOAuthProviderMock).toHaveBeenCalledWith('google', unlinkProof);
    });
  });

  it('refreshes and asks for new proof when provider continuity changed in another tab', async () => {
    const user = userEvent.setup();
    requestOAuthSignInMethodProofMock.mockResolvedValue({
      success: true,
      proof: proof('unlink', 'google'),
    });
    unlinkOAuthProviderMock.mockResolvedValue({
      success: false,
      reason: 'continuity_changed',
      error: 'Your sign-in methods changed. Verify again.',
    });

    render(<SignInMethods userId="user-1" />);
    await user.click(await screen.findByRole('button', { name: 'Unlink Google' }));
    await user.click(screen.getByRole('button', { name: 'Verify with Google' }));
    await user.click(await screen.findByRole('button', { name: 'Unlink sign-in method' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('sign-in methods changed');
    expect(screen.getByRole('button', { name: 'Verify with password' })).toBeInTheDocument();
    expect(listAccountSignInMethodsMock).toHaveBeenCalledTimes(2);
  });

  it('keeps a linked but disabled provider visible', async () => {
    listAccountSignInMethodsMock.mockResolvedValue([
      { provider: 'discord', label: 'Discord', configured: false, linked: true },
    ]);

    render(<SignInMethods userId="user-1" />);

    expect(await screen.findByText('Connected, but currently unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlink Discord' })).toBeInTheDocument();
  });

  it('discards pending credentials and proof when the signed-in user changes', async () => {
    const user = userEvent.setup();
    requestPasswordSignInMethodProofMock.mockResolvedValue({
      success: true,
      proof: proof('link', 'apple'),
    });
    const { rerender } = render(<SignInMethods userId="user-1" />);
    await user.click(await screen.findByRole('button', { name: 'Connect Apple' }));
    await user.type(screen.getByLabelText('Current password'), 'known-password');
    await user.click(screen.getByRole('button', { name: 'Verify with password' }));
    expect(await screen.findByText(/identity verified/i)).toBeInTheDocument();

    rerender(<SignInMethods userId="user-2" />);

    expect(screen.queryByText(/identity verified/i)).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Connect Apple' }));
    expect(screen.getByLabelText('Current password')).toHaveValue('');
  });
});
