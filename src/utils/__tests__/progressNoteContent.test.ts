import { describe, expect, it } from 'vitest';

import { toEditorInitial } from '../progressNoteContent';

describe('toEditorInitial', () => {
  it('preserves single-line breaks in legacy plaintext notes', () => {
    expect(toEditorInitial('First line\nSecond line')).toBe('First line  \nSecond line');
  });

  it('preserves paragraph breaks in legacy plaintext notes', () => {
    expect(toEditorInitial('First paragraph\n\nSecond paragraph')).toBe(
      'First paragraph\n\nSecond paragraph'
    );
  });

  it('leaves Markdown-looking content unchanged', () => {
    expect(toEditorInitial('### Heading\n\nA **bold** note')).toBe(
      '### Heading\n\nA **bold** note'
    );
  });

  it('normalizes Windows CRLF line endings to LF', () => {
    expect(toEditorInitial('First line\r\nSecond line')).toBe('First line  \nSecond line');
  });

  it('normalizes paragraph breaks written with CRLF', () => {
    expect(toEditorInitial('First paragraph\r\n\r\nSecond paragraph')).toBe(
      'First paragraph\n\nSecond paragraph'
    );
  });

  it('returns empty string unchanged', () => {
    expect(toEditorInitial('')).toBe('');
  });

  it('preserves line breaks when legacy text contains asterisks', () => {
    expect(toEditorInitial('I love these 5*5 drills\nfinished today')).toBe(
      'I love these 5*5 drills  \nfinished today'
    );
  });

  it('preserves line breaks when legacy text contains brackets or underscores', () => {
    expect(toEditorInitial('see this_file.txt\nand [project]')).toBe(
      'see this_file.txt  \nand [project]'
    );
  });

  it('still bails out for legacy text that opens with a list-like marker', () => {
    expect(toEditorInitial('- diamonds: 5000\n- hours: 3')).toBe('- diamonds: 5000\n- hours: 3');
  });
});
