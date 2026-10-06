import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auth, dialogImported, hasDraft } = vi.hoisted(() => ({
  auth: { user: { id: 'account-a' } as { id: string } | null, initialCheckComplete: true },
  dialogImported: vi.fn(),
  hasDraft: vi.fn((_key?: string, _accountId?: string) => false),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('@/services/auth/sessionRecovery', () => ({ hasSessionDraft: hasDraft }));
vi.mock('../FeedbackDialog', () => {
  dialogImported();
  return {
    default: ({ isOpen, accountId }: { isOpen: boolean; accountId?: string }) => (
      <div data-testid="mounted-feedback" data-account={accountId}>
        {isOpen && <dialog open>Feedback form</dialog>}
      </div>
    ),
  };
});

import FeedbackDialogProvider from '../FeedbackDialogProvider';
import { useFeedbackDialog } from '../FeedbackDialogStore';

describe('feedback dialog loading', () => {
  beforeEach(() => {
    auth.user = { id: 'account-a' };
    auth.initialCheckComplete = true;
    hasDraft.mockReset().mockReturnValue(false);
    useFeedbackDialog.getState().resetDialog();
  });

  it('does not import or mount a closed feedback form during startup', () => {
    render(<FeedbackDialogProvider />);
    expect(dialogImported).not.toHaveBeenCalled();
    expect(screen.queryByTestId('mounted-feedback')).not.toBeInTheDocument();
  });

  it('loads on demand and keeps the form mounted when closed', async () => {
    const { rerender } = render(<FeedbackDialogProvider />);
    act(() => useFeedbackDialog.getState().openDialog({}));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Feedback form');
    const form = screen.getByTestId('mounted-feedback');
    act(() => useFeedbackDialog.getState().closeDialog());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('mounted-feedback')).toBe(form);
    auth.user = { id: 'account-a' };
    rerender(<FeedbackDialogProvider />);
    expect(screen.getByTestId('mounted-feedback')).toBe(form);
    expect(dialogImported).toHaveBeenCalledTimes(1);
  });

  it('loads a restored draft for the same account after auth is ready', async () => {
    auth.initialCheckComplete = false;
    hasDraft.mockReturnValue(true);
    const { rerender } = render(<FeedbackDialogProvider />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    auth.initialCheckComplete = true;
    rerender(<FeedbackDialogProvider />);
    expect(await screen.findByRole('dialog')).toHaveTextContent('Feedback form');
    expect(screen.getByTestId('mounted-feedback')).toHaveAttribute('data-account', 'account-a');
  });

  it('defers the new account form until it is opened', async () => {
    const { rerender } = render(<FeedbackDialogProvider />);
    act(() => useFeedbackDialog.getState().openDialog({}));
    await screen.findByRole('dialog');
    auth.user = { id: 'account-b' };
    rerender(<FeedbackDialogProvider />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mounted-feedback')).not.toBeInTheDocument();
    act(() => useFeedbackDialog.getState().openDialog({}));
    await screen.findByRole('dialog');
    expect(screen.getByTestId('mounted-feedback')).toHaveAttribute('data-account', 'account-b');
    expect(useFeedbackDialog.getState().options).toEqual({});
  });

  it('unmounts on signout and defers mounting after signing back in', async () => {
    const { rerender } = render(<FeedbackDialogProvider />);
    act(() => useFeedbackDialog.getState().openDialog({ name: 'Account A' }));
    await screen.findByRole('dialog');
    auth.user = null;
    rerender(<FeedbackDialogProvider />);
    expect(screen.queryByTestId('mounted-feedback')).not.toBeInTheDocument();
    expect(useFeedbackDialog.getState().options).toEqual({});
    auth.user = { id: 'account-a' };
    rerender(<FeedbackDialogProvider />);
    expect(screen.queryByTestId('mounted-feedback')).not.toBeInTheDocument();
  });

  it('restores only the new account own draft after an account switch', async () => {
    const { rerender } = render(<FeedbackDialogProvider />);
    act(() => useFeedbackDialog.getState().openDialog({ name: 'Account A' }));
    await screen.findByRole('dialog');
    hasDraft.mockImplementation((_key, accountId) => accountId === 'account-b');
    auth.user = { id: 'account-b' };
    rerender(<FeedbackDialogProvider />);
    await screen.findByRole('dialog');
    expect(screen.getByTestId('mounted-feedback')).toHaveAttribute('data-account', 'account-b');
    expect(useFeedbackDialog.getState().options).toEqual({});
  });
});
