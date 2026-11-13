import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
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
    expect(await screen.findByText(/completion date will be kept/)).toBeInTheDocument();
    expect(screen.queryByText(/still counts as finished/)).not.toBeInTheDocument();
  });

  it('opens even when an unrelated listbox stays on the page', async () => {
    render(<div role="listbox" aria-label="Unrelated" />);
    renderPrompt();
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
  });

  it.each(['Keep Completed', 'Change status'])(
    'returns focus to the explicit trigger after %s',
    async label => {
      const Harness = () => {
        const { confirm, dialog, triggerRef } = useCompletionStatusConfirmation();
        return (
          <>
            <button type="button" aria-expanded="true">
              Other popup
            </button>
            <button type="button" ref={triggerRef}>
              Status
            </button>
            <button type="button" onClick={() => void confirm()}>
              Choose status
            </button>
            {dialog}
          </>
        );
      };
      render(<Harness />);
      await userEvent.click(screen.getByRole('button', { name: 'Choose status' }));
      await userEvent.click(screen.getByRole('button', { name: label }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Status' })).toHaveFocus());
    }
  );

  it('applies unguarded changes synchronously and cancels guarded changes', async () => {
    const apply = vi.fn();
    const Harness = () => {
      const { requestChange, dialog } = useCompletionStatusConfirmation();
      const initialStatus = useRef('wishlist');
      return (
        <>
          <button
            type="button"
            onClick={() => {
              void requestChange(
                'completed',
                'progress',
                '2026-01-01',
                apply,
                initialStatus.current
              );
              if (initialStatus.current === 'wishlist') expect(apply).toHaveBeenCalledTimes(1);
              initialStatus.current = 'completed';
            }}
          >
            Change
          </button>
          {dialog}
        </>
      );
    };
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Change', exact: true }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Change', exact: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Keep Completed' }));
    expect(apply).toHaveBeenCalledTimes(1);
  });

  describe.each([
    [
      'project',
      (
        disabled: boolean,
        onChange: () => void,
        triggerRef: React.RefObject<HTMLButtonElement | null>
      ) => (
        <StatusDropdown
          currentStatus="completed"
          triggerRef={triggerRef}
          onStatusChange={onChange}
          variant="pill"
          disabled={disabled}
        />
      ),
      'Change project status',
    ],
    [
      'coloring page',
      (
        disabled: boolean,
        onChange: () => void,
        triggerRef: React.RefObject<HTMLButtonElement | null>
      ) => (
        <ColoringPageStatusSection
          status="completed"
          triggerRef={triggerRef}
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
        const { confirm, dialog, triggerRef } = useCompletionStatusConfirmation();
        const [saving, setSaving] = useState(false);
        return (
          <>
            {control(
              saving,
              () => {
                void confirm().then(confirmed => {
                  if (!confirmed) return;
                  save();
                  setSaving(true);
                });
              },
              triggerRef
            )}
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
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      "Did you mean to change this project's status? The completion date will be kept and this project still counts as finished."
    );
    await userEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(resolved).toHaveBeenCalledWith(expected));
  });
});
