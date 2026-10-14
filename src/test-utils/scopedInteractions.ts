import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

// Vitest cannot cancel a timed-out test's pending user-event steps. Once cleanup renders the
// next test, a step that searches the whole document, or types into whatever has focus, can drive
// that test's form. These helpers bind portal content to an element the current test owns and
// check focus before entering text, so late steps fail instead of reaching the next test.

function assertStillRendered(owner: HTMLElement, description: string): void {
  if (!owner.isConnected) {
    throw new Error(`${description} is no longer rendered, so its portal cannot be searched.`);
  }
}

/** Queries for the open popup (Radix Select, Popover, or Dialog content) that `trigger` controls. */
function withinControlledPopup(trigger: HTMLElement) {
  assertStillRendered(trigger, 'The popup trigger');
  const popupId = trigger.getAttribute('aria-controls');
  const popup = popupId ? trigger.ownerDocument.getElementById(popupId) : null;
  if (!popup) throw new Error('The trigger does not control an open popup.');
  return within(popup);
}

/** Click `trigger` and return queries for the popup it opened. */
export async function openControlledPopup(user: UserEvent, trigger: HTMLElement) {
  await user.click(trigger);
  return waitFor(() => withinControlledPopup(trigger));
}

/**
 * Find a portal dialog only while `owner` is still rendered. Use this for dialogs that are not
 * linked to their trigger through aria-controls.
 */
export async function findOwnedDialog(
  owner: HTMLElement,
  name: string | RegExp,
  role: 'dialog' | 'alertdialog' = 'dialog'
) {
  const dialog = await waitFor(() => {
    assertStillRendered(owner, 'The dialog owner');
    return screen.getByRole(role, { name });
  });
  return within(dialog);
}

function assertFocused(field: HTMLElement): void {
  // Keyboard and paste events go to whichever element has focus, which may belong to a later test.
  if (!field.isConnected || field.ownerDocument.activeElement !== field) {
    throw new Error('The field is not focused, so no more text was entered.');
  }
}

/**
 * Type `text` one key at a time, like `user.type`, for tests where keystrokes matter. Focus is
 * checked before every key so typing that outlives its test stops instead of continuing into the
 * next test's focused field.
 */
export async function typeIntoField(user: UserEvent, field: HTMLElement, text: string) {
  if (/[{[]/.test(text)) throw new Error('typeIntoField only accepts plain characters.');
  await user.click(field);
  // A keyboard delay would let timeout cleanup move focus after the check below. This
  // sub-session shares the user's device state but dispatches each key without a timer.
  const keyboard = user.setup({ delay: null });
  for (const character of text) {
    assertFocused(field);
    await keyboard.keyboard(character);
  }
}

/**
 * Focus a text field and paste `text` into it. Pasting still fires real input events but avoids
 * re-rendering a large controlled form once per character. Use `typeIntoField` where keystrokes
 * are what the test checks.
 */
export async function pasteIntoField(user: UserEvent, field: HTMLElement, text: string) {
  await user.click(field);
  assertFocused(field);
  await user.paste(text);
}
