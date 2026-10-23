import { describe, expect, it } from 'vitest';

import { sanitizeMarkdownUrl } from '../markdown-url';

describe('sanitizeMarkdownUrl', () => {
  describe('allowed protocols', () => {
    it('accepts plain https URLs', () => {
      expect(sanitizeMarkdownUrl('https://example.com/path')).toBe('https://example.com/path');
    });
  });

  describe('relative URLs', () => {
    it('preserves a relative path unchanged', () => {
      expect(sanitizeMarkdownUrl('/projects/abc')).toBe('/projects/abc');
    });
  });

  describe('blocked protocols', () => {
    it('blocks javascript: URLs', () => {
      expect(sanitizeMarkdownUrl('javascript:alert(1)')).toBe('');
    });

    it('blocks data: URLs', () => {
      expect(sanitizeMarkdownUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    });

    it('blocks javascript: with embedded tab characters in scheme', () => {
      // WHATWG URL parser strips ASCII tab/newline before parsing, so this
      // resolves to protocol "javascript:" and is correctly blocked.
      expect(sanitizeMarkdownUrl('java\tscript:alert(1)')).toBe('');
      expect(sanitizeMarkdownUrl('java\nscript:alert(1)')).toBe('');
    });
  });
});
