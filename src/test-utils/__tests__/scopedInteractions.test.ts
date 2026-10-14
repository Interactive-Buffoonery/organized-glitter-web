import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { pasteIntoField, typeIntoField } from '../scopedInteractions';

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

describe('scoped pasting', () => {
  it.each(['focus', 'paste'])(
    'does not paste into a later field after cleanup on %s',
    async event => {
      vi.useFakeTimers();
      const original = document.createElement('input');
      const replacement = document.createElement('input');
      document.body.append(original);
      original.addEventListener(event, () => {
        setTimeout(() => {
          original.remove();
          document.body.append(replacement);
          replacement.focus();
        }, 0);
      });

      const pasting = pasteIntoField(userEvent.setup({ delay: 20 }), original, '123').catch(
        error => error
      );
      await vi.runAllTimersAsync();
      const result = await pasting;

      expect(replacement).toHaveFocus();
      expect(replacement).toHaveValue('');
      if (event === 'focus') {
        expect(result).toBeInstanceOf(Error);
        expect(result.message).toMatch(/field is not focused/);
        expect(original).toHaveValue('');
      } else {
        expect(result).toBeUndefined();
        expect(original).toHaveValue('123');
      }
    }
  );
});
