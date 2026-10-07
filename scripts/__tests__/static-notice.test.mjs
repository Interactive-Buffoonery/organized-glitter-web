import { describe, expect, it } from 'vitest';
import { inlineStaticNotice } from '../static-notice.mjs';

describe('static notice build integration', () => {
  it('inlines the classic control after the static page is parsed', () => {
    const html = '<main>Home</main><!-- og-static-hosting-notice -->';
    const result = inlineStaticNotice(html, '/* classic notice */');
    expect(result.indexOf('classic notice')).toBeGreaterThan(result.indexOf('</main>'));
    expect(result).not.toContain('type="module"');
    expect(result).not.toContain('src=');
    expect(result).not.toContain('app-bootstrap-resources');
  });
  it('leaves React and other public HTML untouched', () => {
    expect(inlineStaticNotice('<main>Other page</main>', '')).toBe('<main>Other page</main>');
  });
  it('escapes closing script tags', () => {
    expect(inlineStaticNotice('<!-- og-static-hosting-notice -->', '"</script>"')).toContain(
      '<\\/script>'
    );
  });
});
