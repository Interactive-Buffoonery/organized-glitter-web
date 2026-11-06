import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  needsCompletionStatusConfirmation,
  useCompletionStatusConfirmation,
} from '../useCompletionStatusConfirmation';

describe('completion status confirmation', () => {
  it.each([
    ['completed', 'progress', '2026-01-01', true],
    ['completed', 'archived', '2026-01-01', false],
    ['completed', 'destashed', '2026-01-01', false],
    ['completed', 'completed', '2026-01-01', false],
    ['progress', 'wishlist', '2026-01-01', false],
    ['completed', 'progress', '', false],
  ])('guards %s to %s', (current, next, date, expected) => {
    expect(needsCompletionStatusConfirmation(current, next, date)).toBe(expected);
  });

  const renderPrompt = (countsAsFinished?: boolean) => {
    const resolved = vi.fn();
    const Harness = () => {
      const { confirm, dialog } = useCompletionStatusConfirmation({ countsAsFinished });
      return (
        <>
          <button type="button" onClick={() => void confirm().then(resolved)}>
            Ask
          </button>
          {dialog}
        </>
      );
    };
    render(<Harness />);
    return resolved;
  };

  it('leaves out the finished claim for records that stats do not count', async () => {
    renderPrompt(false);
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText(/completion date is kept/)).toBeInTheDocument();
    expect(screen.queryByText(/still counts as finished/)).not.toBeInTheDocument();
  });

  it('opens even when an unrelated listbox stays on the page', async () => {
    render(<div role="listbox" aria-label="Unrelated" />);
    renderPrompt();
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
  });

  it.each([
    ['Keep Completed', false],
    ['Change status', true],
  ] as const)('%s resolves the pending change', async (label, expected) => {
    const resolved = renderPrompt();
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText(/still counts as finished/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(resolved).toHaveBeenCalledWith(expected));
  });
});
