import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import FeedbackDialog from '../FeedbackDialog';
import {
  captureSessionDrafts,
  clearSessionDrafts,
  peekSessionDraft,
  recordCompletedSessionFeedback,
  takeCompletedSessionFeedback,
} from '@/services/auth/sessionRecovery';

const sendFeedbackEmailMock = vi.fn();

vi.mock('@/lib/feedback-email-service', () => ({
  sendFeedbackEmail: (...args: unknown[]) => sendFeedbackEmailMock(...args),
}));

describe('FeedbackDialog', () => {
  beforeEach(() => {
    sendFeedbackEmailMock.mockReset();
    clearSessionDrafts();
    vi.stubEnv('VITE_CONTACT_EMAIL', 'contact@example.test');
  });

  it('explains the length rule and blocks feedback the service would reject', async () => {
    const user = userEvent.setup();
    render(<FeedbackDialog isOpen onOpenChange={vi.fn()} />);

    const messageField = screen.getByRole('textbox', { name: 'Message' });
    await user.type(messageField, 'short');
    expect(messageField).toHaveAccessibleDescription();
    expect(screen.getByRole('button', { name: 'Submit Feedback' })).toBeDisabled();
    expect(sendFeedbackEmailMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'a'.repeat(5001) },
    });
    expect(screen.getByRole('button', { name: 'Submit Feedback' })).toBeDisabled();
    expect(sendFeedbackEmailMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'a'.repeat(5000) },
    });
    expect(screen.getByRole('button', { name: 'Submit Feedback' })).toBeEnabled();
  });

  it('submits a padded 5,000-character draft as the validated message', async () => {
    sendFeedbackEmailMock.mockResolvedValue({ success: true });
    render(<FeedbackDialog isOpen onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: `  ${'a'.repeat(5000)}  ` },
    });
    const submit = screen.getByRole('button', { name: 'Submit Feedback' });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    expect(sendFeedbackEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'a'.repeat(5000) })
    );
  });

  it('keeps the draft when feedback delivery fails', async () => {
    const user = userEvent.setup();
    sendFeedbackEmailMock.mockResolvedValueOnce({
      success: false,
      error:
        "We couldn't send your feedback here. If your email app opened, send the prepared message from there. If it didn't open, email us directly at contact@example.test.",
    });

    render(<FeedbackDialog isOpen onOpenChange={vi.fn()} />);

    const message = 'Please keep this feedback draft available.';
    await user.type(screen.getByLabelText('Message'), message);
    await user.click(screen.getByRole('button', { name: 'Submit Feedback' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't send your feedback here. If your email app opened, send the prepared message from there. If it didn't open, email us directly at contact@example.test."
    );
    expect(screen.getByRole('link', { name: 'contact@example.test' })).toHaveAttribute(
      'href',
      'mailto:contact@example.test'
    );
    expect(screen.getByLabelText('Message')).toHaveValue(message);
    expect(screen.queryByText('Thank you for your message!')).not.toBeInTheDocument();
  });

  it('sends one message when the form is submitted twice before rendering', async () => {
    let resolveSend!: (value: { success: boolean }) => void;
    sendFeedbackEmailMock.mockReturnValue(
      new Promise(resolve => {
        resolveSend = resolve;
      })
    );
    const user = userEvent.setup();

    render(<FeedbackDialog isOpen onOpenChange={vi.fn()} />);
    await user.type(screen.getByLabelText('Message'), 'A useful feedback message');
    const form = screen.getByRole('button', { name: 'Submit Feedback' }).closest('form');
    expect(form).not.toBeNull();

    act(() => {
      fireEvent.submit(form!);
      fireEvent.submit(form!);
    });

    expect(sendFeedbackEmailMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSend({ success: true });
    });
  });

  it('does not let an old request overwrite or close a reopened dialog', async () => {
    vi.useFakeTimers();
    let resolveSend!: (value: { success: boolean }) => void;
    sendFeedbackEmailMock.mockReturnValue(
      new Promise(resolve => {
        resolveSend = resolve;
      })
    );

    function Harness() {
      const [isOpen, setIsOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>
            Open feedback
          </button>
          <FeedbackDialog isOpen={isOpen} onOpenChange={setIsOpen} />
        </>
      );
    }

    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Message from the old session' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Feedback' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open feedback' }));
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Draft in the reopened dialog' },
    });

    await act(async () => {
      resolveSend({ success: true });
      await Promise.resolve();
    });

    expect(screen.getByLabelText('Message')).toHaveValue('Draft in the reopened dialog');
    expect(screen.queryByText('Thank you for your message!')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('marks a restored message as sent when its old response arrives', async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <FeedbackDialog isOpen accountId="account-a" onOpenChange={onOpenChange} />
    );
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Sent after the session expired' },
    });
    captureSessionDrafts('account-a', 'token-a');
    const draftId = peekSessionDraft<{ draftId: string }>('feedback-dialog', 'account-a')?.draftId;
    rerender(<FeedbackDialog isOpen={false} onOpenChange={onOpenChange} />);
    rerender(<FeedbackDialog isOpen accountId="account-a" onOpenChange={onOpenChange} />);
    expect(screen.getByLabelText('Message')).toHaveValue('Sent after the session expired');

    act(() =>
      recordCompletedSessionFeedback('token-a', {
        draftId,
        message: 'Sent after the session expired',
        name: 'Anonymous User',
        email: '',
      })
    );

    expect(screen.getByText('Thank you for your message!')).toBeInTheDocument();
  });

  it('keeps a restored draft when its email changed after the old request', () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <FeedbackDialog isOpen accountId="account-a" onOpenChange={onOpenChange} />
    );
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Sent after the session expired' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'old@example.test' },
    });
    captureSessionDrafts('account-a', 'token-a');
    const draftId = peekSessionDraft<{ draftId: string }>('feedback-dialog', 'account-a')?.draftId;
    rerender(<FeedbackDialog isOpen={false} onOpenChange={onOpenChange} />);
    rerender(<FeedbackDialog isOpen accountId="account-a" onOpenChange={onOpenChange} />);
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'new@example.test' },
    });

    act(() =>
      recordCompletedSessionFeedback('token-a', {
        draftId,
        message: 'Sent after the session expired',
        email: 'old@example.test',
        name: 'Anonymous User',
      })
    );

    expect(screen.getByLabelText('Email')).toHaveValue('new@example.test');
    expect(screen.queryByText('Thank you for your message!')).not.toBeInTheDocument();
    expect(takeCompletedSessionFeedback('account-a')).toEqual({
      draftId,
      message: 'Sent after the session expired',
      email: 'old@example.test',
      name: 'Anonymous User',
    });
  });

  it('marks an already delivered message as sent when the dialog restores', () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <FeedbackDialog isOpen accountId="account-a" onOpenChange={onOpenChange} />
    );
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Sent before the dialog restored' },
    });
    captureSessionDrafts('account-a', 'token-a');
    const draftId = peekSessionDraft<{ draftId: string }>('feedback-dialog', 'account-a')?.draftId;
    rerender(<FeedbackDialog isOpen={false} onOpenChange={onOpenChange} />);
    recordCompletedSessionFeedback('token-a', {
      draftId,
      message: 'Sent before the dialog restored',
      email: '',
      name: 'Anonymous User',
    });

    rerender(<FeedbackDialog isOpen accountId="account-a" onOpenChange={onOpenChange} />);

    expect(screen.getByText('Thank you for your message!')).toBeInTheDocument();
  });
});
