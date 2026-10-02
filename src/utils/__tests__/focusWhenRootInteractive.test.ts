import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';

import { focusWhenRootInteractive, isRootInert } from '../focusWhenRootInteractive';

describe('focusWhenRootInteractive', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('focuses immediately when #root is not inert', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.append(root);
    const heading = document.createElement('h2');
    document.body.append(heading);
    const focus = vi.spyOn(heading, 'focus');

    focusWhenRootInteractive(heading);

    expect(isRootInert()).toBe(false);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('waits until isRootInert becomes false before focusing', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    root.setAttribute('inert', '');
    document.body.append(root);
    const heading = document.createElement('h2');
    document.body.append(heading);
    const focus = vi.spyOn(heading, 'focus');

    focusWhenRootInteractive(heading);

    expect(isRootInert()).toBe(true);
    expect(focus).not.toHaveBeenCalled();

    root.removeAttribute('inert');

    await waitFor(() => {
      expect(isRootInert()).toBe(false);
      expect(focus).toHaveBeenCalledTimes(1);
    });
  });

  it('disconnects the pending root observer when the caller stops waiting', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    root.setAttribute('inert', '');
    document.body.append(root);
    const save = document.createElement('button');
    root.append(save);
    const focus = vi.spyOn(save, 'focus');
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');

    const stopWaiting = focusWhenRootInteractive(save);
    stopWaiting();
    expect(disconnect).toHaveBeenCalledOnce();

    root.removeAttribute('inert');
    await Promise.resolve();
    expect(focus).not.toHaveBeenCalled();
    disconnect.mockRestore();
  });
});
