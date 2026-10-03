import { describe, expect, it } from 'vitest';

import { sanitizeMarkdownUrl } from '../markdown-url';

describe('sanitizeMarkdownUrl', () => {
  describe('allowed protocols', () => {
    it('accepts plain https URLs', () => {
      expect(sanitizeMarkdownUrl('https://example.com/path')).toBe('https://example.com/path');
    });

    it('accepts http URLs', () => {
      expect(sanitizeMarkdownUrl('http://example.com')).toBe('http://example.com/');
    });

    it('accepts mailto URLs', () => {
      expect(sanitizeMarkdownUrl('mailto:user@example.com')).toBe('mailto:user@example.com');
    });

    it('accepts tel URLs', () => {
      expect(sanitizeMarkdownUrl('tel:+15551234567')).toBe('tel:+15551234567');
    });

    it('normalizes uppercase protocol to lowercase', () => {
      expect(sanitizeMarkdownUrl('HTTPS://EXAMPLE.com/Foo')).toBe('https://example.com/Foo');
    });
  });

  describe('relative URLs', () => {
    it('preserves a relative path unchanged', () => {
      expect(sanitizeMarkdownUrl('/projects/abc')).toBe('/projects/abc');
    });

    it('preserves a relative anchor unchanged', () => {
      expect(sanitizeMarkdownUrl('#section-2')).toBe('#section-2');
    });
  });

  describe('blocked protocols', () => {
    it('blocks javascript: URLs', () => {
      expect(sanitizeMarkdownUrl('javascript:alert(1)')).toBe('');
    });

    it('blocks data: URLs', () => {
      expect(sanitizeMarkdownUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    });

    it('blocks vbscript: URLs', () => {
      expect(sanitizeMarkdownUrl('vbscript:msgbox(1)')).toBe('');
    });

    it('blocks file: URLs', () => {
      expect(sanitizeMarkdownUrl('file:///etc/passwd')).toBe('');
    });

    it('blocks case-variant javascript: URLs', () => {
      expect(sanitizeMarkdownUrl('JAVASCRIPT:alert(1)')).toBe('');
      expect(sanitizeMarkdownUrl('JaVaScRiPt:alert(1)')).toBe('');
    });

    it('blocks javascript: even with leading whitespace', () => {
      expect(sanitizeMarkdownUrl('   javascript:alert(1)')).toBe('');
    });

    it('blocks javascript: with embedded tab characters in scheme', () => {
      // WHATWG URL parser strips ASCII tab/newline before parsing, so this
      // resolves to protocol "javascript:" and is correctly blocked.
      expect(sanitizeMarkdownUrl('java\tscript:alert(1)')).toBe('');
      expect(sanitizeMarkdownUrl('java\nscript:alert(1)')).toBe('');
    });
  });

  describe('edge cases', () => {
    it('returns empty string for empty input', () => {
      expect(sanitizeMarkdownUrl('')).toBe('');
    });

    it('returns empty string for whitespace-only input', () => {
      expect(sanitizeMarkdownUrl('   ')).toBe('');
    });
  });
});
