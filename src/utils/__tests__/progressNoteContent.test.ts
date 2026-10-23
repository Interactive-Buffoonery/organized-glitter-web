import { describe, expect, it } from 'vitest';

import { toEditorInitial } from '../progressNoteContent';

describe('toEditorInitial', () => {
  it('leaves Markdown-looking content unchanged', () => {
    expect(toEditorInitial('### Heading\n\nA **bold** note')).toBe(
      '### Heading\n\nA **bold** note'
    );
  });

  it('normalizes Windows CRLF line endings to LF', () => {
    expect(toEditorInitial('First line\r\nSecond line')).toBe('First line  \nSecond line');
  });
});
