import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Editor } from '@tiptap/core';
import { describe, expect, it, vi } from 'vitest';
import { useState, type FormEvent } from 'react';

import RichTextEditor from '../RichTextEditor';
import { progressNoteEditorExtensions } from '../editor-extensions';
import type { MarkdownString } from '@/types/markdown';

describe('RichTextEditor', () => {
  const ControlledEditor = () => {
    const [value, setValue] = useState<MarkdownString>('');

    return <RichTextEditor value={value} onChange={setValue} />;
  };

  const fireTouchPointerDown = (element: HTMLElement) => {
    const event = createEvent.pointerDown(element);
    Object.defineProperty(event, 'pointerType', { value: 'touch' });
    return fireEvent(element, event);
  };

  it('serializes supported toolbar formatting as Markdown', () => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: progressNoteEditorExtensions,
      content: 'Sparkly section',
      contentType: 'markdown',
    });

    editor.commands.selectAll();
    editor.commands.toggleBold();

    expect(editor.getMarkdown()).toContain('**Sparkly section**');

    editor.destroy();
  });

  it('keeps manual numbered-list formatting available', () => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: progressNoteEditorExtensions,
      content: 'purchased in a destash',
      contentType: 'markdown',
    });

    editor.commands.selectAll();
    editor.commands.toggleOrderedList();

    expect(editor.getMarkdown().trim()).toBe('1. purchased in a destash');

    editor.destroy();
  });

  it('keeps version-like note text as plain Markdown', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<RichTextEditor value="" onChange={onChange} />);

    await user.click(screen.getByLabelText('Progress note content'));
    await user.keyboard('v1. purchased in a destash');

    expect(onChange).toHaveBeenLastCalledWith('v1. purchased in a destash');
  });

  it('keeps typed numbered markers as plain text', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<RichTextEditor value="" onChange={onChange} />);

    await user.click(screen.getByLabelText('Progress note content'));
    await user.keyboard('1. purchased in a destash');

    expect(onChange).toHaveBeenLastCalledWith('1. purchased in a destash');
  });

  it('keeps pasted numbered markers as plain text', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<RichTextEditor value="" onChange={onChange} />);

    await user.click(screen.getByLabelText('Progress note content'));
    await user.paste('1. purchased in a destash');

    expect(onChange).toHaveBeenLastCalledWith('1. purchased in a destash');
  });

  it('keeps toolbar buttons from submitting the parent form', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <RichTextEditor value="" onChange={vi.fn()} />
        <button type="submit">Save</button>
      </form>
    );

    await user.click(screen.getByRole('button', { name: 'Italic' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('preserves editor focus when toolbar buttons are clicked', () => {
    render(<RichTextEditor value="Existing note" onChange={vi.fn()} />);

    expect(fireEvent.mouseDown(screen.getByRole('button', { name: 'Bold' }))).toBe(false);
  });

  it('preserves editor focus before touch toolbar actions run', () => {
    render(<RichTextEditor value="Existing note" onChange={vi.fn()} />);

    expect(fireTouchPointerDown(screen.getByRole('button', { name: 'Bold' }))).toBe(false);
  });

  it('disables editing and toolbar actions', () => {
    render(<RichTextEditor value="Existing note" onChange={vi.fn()} disabled />);

    expect(screen.getByRole('button', { name: 'Bold' })).toBeDisabled();
    expect(screen.getByLabelText('Progress note content')).toHaveAttribute(
      'contenteditable',
      'false'
    );
  });

  it('allows native correction while keeping autocapitalization disabled', () => {
    render(<RichTextEditor value="" onChange={vi.fn()} />);

    const editor = screen.getByLabelText('Progress note content');

    expect(editor).toHaveAttribute('autocapitalize', 'off');
    expect(editor).toHaveAttribute('autocorrect', 'on');
    expect(editor).toHaveAttribute('spellcheck', 'true');
  });

  it('applies bold formatting when the Bold toolbar button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<RichTextEditor value="Hello world" onChange={onChange} />);

    await user.click(screen.getByLabelText('Progress note content'));
    await user.keyboard('{Control>}a{/Control}');
    await user.click(screen.getByRole('button', { name: 'Bold' }));

    expect(onChange).toHaveBeenLastCalledWith('**Hello world**');
  });

  it('does not duplicate the first uppercase character typed into an empty editor', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<RichTextEditor value="" onChange={onChange} />);

    await user.click(screen.getByLabelText('Progress note content'));
    await user.keyboard('A');

    expect(onChange).toHaveBeenLastCalledWith('A');
  });

  it('keeps controlled state to one uppercase first character', async () => {
    const user = userEvent.setup();

    render(<ControlledEditor />);

    const editor = screen.getByLabelText('Progress note content');
    await user.click(editor);
    await user.keyboard('A');

    expect(editor).toHaveTextContent(/^A$/);
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
