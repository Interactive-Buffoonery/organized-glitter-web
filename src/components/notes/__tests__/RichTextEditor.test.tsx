import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import RichTextEditor from '../RichTextEditor';

describe('RichTextEditor', () => {
  const fireTouchPointerDown = (element: HTMLElement) => {
    const event = createEvent.pointerDown(element);
    Object.defineProperty(event, 'pointerType', { value: 'touch' });
    return fireEvent(element, event);
  };

  it('saves and reopens an explicit numbered list from the toolbar', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { unmount } = render(<RichTextEditor value="Explicit item" onChange={onChange} />);

    await user.click(screen.getByRole('textbox'));
    await user.click(screen.getByRole('button', { name: 'Numbered list' }));

    const saved = onChange.mock.lastCall?.[0] as string;
    expect(saved.trim()).toBe('1. Explicit item');
    unmount();
    render(<RichTextEditor value={saved} onChange={vi.fn()} />);

    expect(screen.getByRole('textbox').querySelector('ol > li')).toHaveTextContent('Explicit item');
  });

  it('does not duplicate the first uppercase character typed into an empty editor', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<RichTextEditor value="" onChange={onChange} />);

    await user.click(screen.getByLabelText('Progress note content'));
    await user.keyboard('A');

    expect(onChange).toHaveBeenLastCalledWith('A');
  });

  it('applies touch toolbar actions exactly once across pointerdown + click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<RichTextEditor value="Hello world" onChange={onChange} />);

    await user.click(screen.getByLabelText('Progress note content'));
    await user.keyboard('{Control>}a{/Control}');

    const boldButton = screen.getByRole('button', { name: 'Bold' });
    onChange.mockClear();

    fireTouchPointerDown(boldButton);
    fireEvent.click(boldButton);

    // The pointerdown path applies bold; the follow-up click must be skipped.
    // If both fired the toggle, the result would un-bold and onChange would
    // emit "Hello world" rather than the bolded form.
    expect(onChange).toHaveBeenLastCalledWith('**Hello world**');
  });
});
