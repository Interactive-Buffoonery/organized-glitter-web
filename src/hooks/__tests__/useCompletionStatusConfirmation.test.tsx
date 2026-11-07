import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState, type JSX } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ColoringPageStatusSection } from '@/components/coloring/detail/page/ColoringPageStatusSection';
import StatusDropdown from '@/components/projects/StatusDropdown';
import {
  needsCompletionStatusConfirmation,
  useCompletionStatusConfirmation,
} from '../useCompletionStatusConfirmation';

describe('completion status confirmation', () => {
  beforeAll(() => {
    Element.prototype.hasPointerCapture ??= vi.fn(() => false);
    Element.prototype.scrollIntoView ??= vi.fn();
  });

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

  const askFromFocus = async (popups: JSX.Element) => {
    let ask = () => {};
    const Harness = () => {
      const { confirm, dialog } = useCompletionStatusConfirmation();
      ask = () => void confirm();
      return (
        <>
          {popups}
          {dialog}
        </>
      );
    };
    render(<Harness />);
    act(() => ask());
    return screen.findByRole('alertdialog', undefined, { timeout: 2000 });
  };

  const expandedTrigger = (name: string, popupId: string, role?: string) => (
    <button
      type="button"
      role={role}
      aria-haspopup={role ? undefined : 'dialog'}
      aria-expanded="true"
      aria-controls={popupId}
      aria-label={name}
    >
      {name}
    </button>
  );

  it('opens the prompt when the Select never unmounts, and returns focus to its trigger', async () => {
    const Option = () => {
      useEffect(() => screen.getByRole('option').focus(), []);
      return (
        <div role="option" aria-selected="false" tabIndex={-1}>
          On Hold
        </div>
      );
    };
    await askFromFocus(
      <>
        {expandedTrigger('Other', 'other-popup')}
        {expandedTrigger('Status', 'stuck-listbox', 'combobox')}
        <div id="stuck-listbox" role="listbox">
          <Option />
        </div>
      </>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Keep Completed' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Status' })).toHaveFocus());
  });

  it('returns focus to the popover that holds focus, not the first open popup', async () => {
    const Choice = () => {
      useEffect(() => screen.getByRole('button', { name: 'On Hold' }).focus(), []);
      return <button type="button">On Hold</button>;
    };
    await askFromFocus(
      <>
        {expandedTrigger('Other', 'other-popup')}
        {expandedTrigger('Book status', 'status-popup')}
        <div data-radix-popper-content-wrapper="">
          <div id="status-popup" role="dialog">
            <Choice />
          </div>
        </div>
      </>
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Book status' })).toHaveFocus());
  });

  it('leaves focus to the dialog when nothing identifies the trigger', async () => {
    await askFromFocus(
      <>
        {expandedTrigger('Other', 'other-popup')}
        {expandedTrigger('Book status', 'status-popup')}
      </>
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Other' })).not.toHaveFocus();
    expect(screen.getByRole('button', { name: 'Book status' })).not.toHaveFocus();
  });

  it('uses the only open Select when nothing has focus', async () => {
    await askFromFocus(expandedTrigger('Status', 'closed-listbox', 'combobox'));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Status' })).toHaveFocus());
  });

  describe.each([
    [
      'project',
      (disabled: boolean, onChange: () => void) => (
        <StatusDropdown
          currentStatus="completed"
          onStatusChange={onChange}
          variant="pill"
          disabled={disabled}
        />
      ),
      'Change project status',
    ],
    [
      'coloring page',
      (disabled: boolean, onChange: () => void) => (
        <ColoringPageStatusSection
          status="completed"
          onStatusChange={onChange}
          disabled={disabled}
        />
      ),
      'Change page status',
    ],
  ])('%s status control during a slow save', (_name, control, label) => {
    const confirmAndSave = async () => {
      const save = vi.fn();
      const Harness = () => {
        const { confirm, dialog } = useCompletionStatusConfirmation();
        const [saving, setSaving] = useState(false);
        return (
          <>
            {control(saving, () => {
              void confirm().then(confirmed => {
                if (!confirmed) return;
                save();
                setSaving(true);
              });
            })}
            {dialog}
          </>
        );
      };
      render(<Harness />);
      const user = userEvent.setup();
      const trigger = screen.getByRole('combobox', { name: label });
      await user.click(trigger);
      await user.click(screen.getByRole('option', { name: /^on hold$/i }));
      await user.click(await screen.findByRole('button', { name: 'Change status' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      return { save, trigger, user };
    };

    it('keeps focus on the trigger', async () => {
      const { trigger } = await confirmAndSave();
      await waitFor(() => expect(trigger).toHaveFocus());
      expect(trigger).toHaveAttribute('aria-disabled', 'true');
    });

    it('ignores further changes until the save settles', async () => {
      const { save, trigger, user } = await confirmAndSave();
      await waitFor(() => expect(trigger).toHaveFocus());
      await user.keyboard('{Enter}');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      await user.keyboard('o');
      expect(save).toHaveBeenCalledTimes(1);
    });
  });

  it('does not reopen a menu that a save closed', async () => {
    const { rerender } = render(
      <StatusDropdown currentStatus="completed" onStatusChange={vi.fn()} />
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Change project status' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    rerender(<StatusDropdown currentStatus="completed" onStatusChange={vi.fn()} disabled />);
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    rerender(<StatusDropdown currentStatus="completed" onStatusChange={vi.fn()} />);
    await act(() => new Promise(done => setTimeout(done, 50)));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
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
