import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { typeIntoField } from '../scopedInteractions';

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('scoped typing', () => {
  it('does not type into a later field when cleanup occurs during a keyboard delay', async () => {
    vi.useFakeTimers();
    const original = document.createElement('input');
    const replacement = document.createElement('input');
    document.body.append(original);
    const user = userEvent.setup({ delay: 20 });
    const click = user.click.bind(user);
    let clickComplete = false;
    vi.spyOn(user, 'click').mockImplementation(async target => {
      await click(target);
      clickComplete = true;
    });
    const typing = typeIntoField(user, original, '7').catch(error => error);

    // Wait for the click to finish, leaving the keyboard action's delay pending.
    for (let elapsed = 0; !clickComplete && elapsed < 500; elapsed += 1) {
      await vi.advanceTimersByTimeAsync(1);
    }
    expect(clickComplete).toBe(true);
    original.remove();
    document.body.append(replacement);
    replacement.focus();
    await vi.runAllTimersAsync();
    await typing;

    expect(replacement).toHaveValue('');
  });

  it('retains per-key input events on the owned field', async () => {
    const field = document.createElement('input');
    document.body.append(field);
    const input = vi.fn();
    field.addEventListener('input', input);

    await typeIntoField(userEvent.setup(), field, '123');

    expect(field).toHaveValue('123');
    expect(input).toHaveBeenCalledTimes(3);
  });
});
