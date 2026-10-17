import { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';

import { progressNoteEditorExtensions } from '../editor-extensions';

describe('progress note Markdown serialization', () => {
  it.each([
    '<p>1. Keep this as ordinary text</p>',
    '<p>2) Another plain marker</p>',
    '<p>123456789. Nine digit marker</p>',
    '<p>1. First paragraph</p><p>2. Second paragraph</p>',
    '<p>Intro<br>1. After a line break</p>',
    '<p>1. Plain paragraph</p><ol><li><p>Explicit item</p></li></ol><p>2. Plain again</p>',
    '<ol><li><p>1. Literal marker inside an item</p><ol><li><p>Nested item</p></li></ol></li><li><p>Next item</p></li></ol>',
    '<ul><li><p>1. Literal marker in a bullet</p></li></ul>',
    '<p>1. <strong>Bold</strong> and <em>italic</em> text</p>',
    '<p>1\\. Literal backslash</p>',
    '<p>v1. Version text and 2. inline numbers</p>',
    '<p>Intro</p><p></p><p></p><p>1. After empty paragraphs</p>',
  ])('preserves paragraph and list structure across a round-trip: %s', content => {
    const editor = new Editor({
      extensions: progressNoteEditorExtensions,
      content,
    });
    const saved = editor.getMarkdown();
    const reopened = new Editor({
      extensions: progressNoteEditorExtensions,
      content: saved,
      contentType: 'markdown',
    });

    try {
      expect(reopened.getJSON()).toEqual(editor.getJSON());
      expect(reopened.getMarkdown()).toBe(saved);
    } finally {
      editor.destroy();
      reopened.destroy();
    }
  });

  it('retains legacy saved ordered lists and nested lists', () => {
    const content = '3. First item\n   1. Nested item\n4. Next item';
    const editor = new Editor({
      extensions: progressNoteEditorExtensions,
      content,
      contentType: 'markdown',
    });
    const reopened = new Editor({
      extensions: progressNoteEditorExtensions,
      content: editor.getMarkdown(),
      contentType: 'markdown',
    });

    try {
      expect(editor.getJSON().content?.[0]).toMatchObject({
        type: 'orderedList',
        attrs: { start: 3 },
        content: [
          { type: 'listItem', content: [{ type: 'paragraph' }, { type: 'orderedList' }] },
          { type: 'listItem' },
        ],
      });
      expect(reopened.getJSON()).toEqual(editor.getJSON());
      expect(editor.getMarkdown()).toContain('3. First item');
      expect(editor.getMarkdown()).toContain('1. Nested item');
    } finally {
      editor.destroy();
      reopened.destroy();
    }
  });
});
