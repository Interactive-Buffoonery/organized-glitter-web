import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EditConflictPanel } from '@/components/drafts/EditConflictPanel';
import { useFocusAfterEditRecovery } from '../useFocusAfterEditRecovery';

const setupRoot = () => {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.append(root);
  const save = document.createElement('button');
  save.id = 'edit-save';
  save.textContent = 'Save edit';
  root.append(save);
  return { root, save };
};

const deferred = () => {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>(finish => {
    resolve = finish;
  });
  return { promise, resolve };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('useFocusAfterEditRecovery', () => {
  it('focuses surviving Save after recovery unmounts its conflict panel', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const user = userEvent.setup();
    const { root } = setupRoot();
    const recovery = deferred();
    let frame!: FrameRequestCallback;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });

    function EditOwner() {
      const [conflict, setConflict] = useState(true);
      const recoverAndFocus = useFocusAfterEditRecovery({
        active: true,
        identity: 'user:project-a',
        saveButtonId: 'edit-save',
      });
      return (
        <>
          {conflict && (
            <EditConflictPanel
              itemName="project"
              detailPath="/projects/project-a"
              onUseLatest={() =>
                recoverAndFocus(async () => {
                  const recovered = await recovery.promise;
                  if (recovered) setConflict(false);
                  return recovered;
                })
              }
            />
          )}
          <button id="edit-save" type="button">
            Save edit
          </button>
        </>
      );
    }

    const { unmount } = render(<EditOwner />, { container: root });
    await user.click(screen.getByRole('button', { name: 'Keep my edits for a new save' }));
    root.setAttribute('inert', '');
    await act(async () => recovery.resolve(true));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    const save = screen.getByRole('button', { name: 'Save edit' });
    act(() => frame(0));
    expect(save).not.toHaveFocus();
    root.removeAttribute('inert');
    await waitFor(() => expect(save).toHaveFocus());
    unmount();
  });

  it.each([
    ['closing', false, 'user:project-a'],
    ['changing identity', true, 'user:project-b'],
  ])('cancels an inert-root focus wait on %s', async (_event, active, identity) => {
    const { root, save } = setupRoot();
    const focus = vi.spyOn(save, 'focus');
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    root.setAttribute('inert', '');
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const { result, rerender } = renderHook(
      ({ active, identity }) =>
        useFocusAfterEditRecovery({ active, identity, saveButtonId: 'edit-save' }),
      { initialProps: { active: true, identity: 'user:project-a' } }
    );

    await act(async () => result.current(async () => true));
    expect(focus).not.toHaveBeenCalled();
    rerender({ active, identity });
    expect(disconnect).toHaveBeenCalled();
    root.removeAttribute('inert');
    await act(async () => Promise.resolve());
    expect(focus).not.toHaveBeenCalled();
  });

  it('lets only the newest recovery attempt schedule focus', async () => {
    const { save } = setupRoot();
    const focus = vi.spyOn(save, 'focus');
    const first = deferred();
    const second = deferred();
    let frame!: FrameRequestCallback;
    const schedule = vi.fn((callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    vi.stubGlobal('requestAnimationFrame', schedule);
    const { result } = renderHook(() =>
      useFocusAfterEditRecovery({
        active: true,
        identity: 'user:project-a',
        saveButtonId: 'edit-save',
      })
    );

    const firstAttempt = result.current(() => first.promise);
    const secondAttempt = result.current(() => second.promise);
    await act(async () => first.resolve(true));
    expect(await firstAttempt).toBe(true);
    expect(schedule).not.toHaveBeenCalled();
    await act(async () => second.resolve(true));
    expect(await secondAttempt).toBe(true);
    expect(schedule).toHaveBeenCalledOnce();
    act(() => frame(0));
    expect(focus).toHaveBeenCalledOnce();
  });

  it('does not schedule focus after false or thrown recovery', async () => {
    setupRoot();
    const schedule = vi.fn();
    vi.stubGlobal('requestAnimationFrame', schedule);
    const { result } = renderHook(() =>
      useFocusAfterEditRecovery({
        active: true,
        identity: 'user:project-a',
        saveButtonId: 'edit-save',
      })
    );

    await act(async () => expect(result.current(async () => false)).resolves.toBe(false));
    await act(async () =>
      expect(
        result.current(async () => {
          throw new Error('Could not refresh');
        })
      ).rejects.toThrow('Could not refresh')
    );
    expect(schedule).not.toHaveBeenCalled();
  });

  it('runs recovery while inactive without scheduling focus', async () => {
    setupRoot();
    const schedule = vi.fn();
    const recover = vi.fn(async () => true);
    vi.stubGlobal('requestAnimationFrame', schedule);
    const { result } = renderHook(() =>
      useFocusAfterEditRecovery({
        active: false,
        identity: 'user:project-a',
        saveButtonId: 'edit-save',
      })
    );

    await act(async () => expect(result.current(recover)).resolves.toBe(true));

    expect(recover).toHaveBeenCalledOnce();
    expect(schedule).not.toHaveBeenCalled();
  });
});
