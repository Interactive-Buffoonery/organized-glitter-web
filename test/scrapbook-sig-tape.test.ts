import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const scrapbookCss = readFileSync(resolve(process.cwd(), 'src/styles/scrapbook.css'), 'utf8');

describe('Sarah signature washi tape', () => {
  it('sizes and offsets tapes so both strips fit on a 320px phone', () => {
    expect(scrapbookCss).toMatch(
      /\.sig-panel__tape\s*\{[^}]*width:\s*clamp\(72px,\s*28vw,\s*120px\)/
    );
    expect(scrapbookCss).toMatch(
      /\.sig-panel__tape--tl\s*\{[^}]*left:\s*clamp\(12px,\s*6vw,\s*36px\)/
    );
    expect(scrapbookCss).toMatch(
      /\.sig-panel__tape--tr\s*\{[^}]*right:\s*clamp\(12px,\s*6vw,\s*36px\)/
    );
    expect(scrapbookCss).not.toMatch(/\.sig-panel__tape\s*\{[^}]*width:\s*120px;/);
  });
});
