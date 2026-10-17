import { act } from '@testing-library/react';
import { Suspense, startTransition } from 'react';
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

  it('keeps version-like note text as plain Markdown', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<RichTextEditor value="" onChange={onChange} />);

    await user.click(screen.getByLabelText('Progress note content'));
    await user.keyboard('v1. purchased in a destash');

    expect(onChange).toHaveBeenLastCalledWith('v1. purchased in a destash');
  });

  it('keeps typed numbered markers as paragraphs after saving and reopening', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { unmount } = render(<RichTextEditor value="" onChange={onChange} />);

    await user.click(screen.getByLabelText('Progress note content'));
    await user.keyboard('1. Keep this as ordinary text');

    expect(screen.getByRole('textbox').querySelector('ol, li')).toBeNull();
    const saved = onChange.mock.lastCall?.[0] as string;
    unmount();
    render(<RichTextEditor value={saved} onChange={vi.fn()} />);
    const reopened = screen.getByRole('textbox');
    expect(reopened.querySelector('ol, li')).toBeNull();
    expect(reopened.querySelector('p')).toHaveTextContent('1. Keep this as ordinary text');
    expect(saved).toBe('1\\. Keep this as ordinary text');
  });

  it('keeps pasted numbered markers as plain text', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<RichTextEditor value="" onChange={onChange} />);

    const editor = screen.getByLabelText('Progress note content');
    await user.click(editor);
    await user.paste('1. purchased in a destash');

    expect(editor.querySelector('ol, li')).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith('1\\. purchased in a destash');
  });

  it('keeps multiline numbered text from a native paste as paragraphs', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const text = '1. purchased in a destash\n2. started today';

    const { unmount } = render(<RichTextEditor value="" onChange={onChange} />);

    const editor = screen.getByLabelText('Progress note content');
    await user.click(editor);
    fireEvent.paste(editor, {
      clipboardData: {
        getData: (format: string) => (format === 'text/plain' ? text : ''),
      },
    });

    expect(editor.querySelector('ol, li')).toBeNull();
    expect(editor.querySelectorAll('p')).toHaveLength(2);
    const saved = onChange.mock.lastCall?.[0] as string;
    unmount();
    render(<RichTextEditor value={saved} onChange={vi.fn()} />);
    const reopened = screen.getByRole('textbox');
    expect(reopened.querySelector('ol, li')).toBeNull();
    expect(reopened.querySelectorAll('p')).toHaveLength(2);
    expect(reopened).toHaveTextContent('1. purchased in a destash');
    expect(reopened).toHaveTextContent('2. started today');
    expect(saved).toBe('1\\. purchased in a destash\n\n2\\. started today');
  });

  it('preserves ordered lists pasted as rich HTML', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<RichTextEditor value="" onChange={onChange} />);

    const editor = screen.getByLabelText('Progress note content');
    await user.click(editor);
    fireEvent.paste(editor, {
      clipboardData: {
        getData: (format: string) =>
          format === 'text/html'
            ? '<ol><li><p>purchased in a destash</p></li></ol>'
            : format === 'text/plain'
              ? '1. purchased in a destash'
              : '',
      },
    });

    expect(editor.querySelector('ol > li')).toHaveTextContent('purchased in a destash');
    expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining('1. purchased in a destash'));
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

  it('keeps the committed callback when a replacement render suspends', async () => {
    const committed = vi.fn();
    const speculative = vi.fn();
    const pending = new Promise<void>(() => {});
    let update!: (suspended: boolean) => void;
    let attempted = false;
    const Suspend = ({ active }: { active: boolean }) => {
      if (active) {
        attempted = true;
        throw pending;
      }
      return null;
    };
    const Harness = () => {
      const [suspended, setSuspended] = useState(false);
      update = setSuspended;
      return (
        <>
          <RichTextEditor value="" onChange={suspended ? speculative : committed} />
          <Suspend active={suspended} />
        </>
      );
    };
    render(
      <Suspense fallback="Loading">
        <Harness />
      </Suspense>
    );
    await act(async () => {
      startTransition(() => update(true));
    });
    expect(attempted).toBe(true);
    committed.mockClear();
    speculative.mockClear();
    const user = userEvent.setup();
    await user.click(screen.getByRole('textbox'));
    await user.paste('Committed note');
    expect(committed).toHaveBeenLastCalledWith('Committed note');
    expect(speculative).not.toHaveBeenCalled();
    act(() => update(false));
  });

  it('uses the replacement callback after it commits', async () => {
    const first = vi.fn();
    const next = vi.fn();
    const { rerender } = render(<RichTextEditor value="" onChange={first} />);
    first.mockClear();
    rerender(<RichTextEditor value="" onChange={next} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('textbox'));
    await user.paste('Latest note');
    expect(next).toHaveBeenLastCalledWith('Latest note');
    expect(first).not.toHaveBeenCalled();
  });
});
