import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const indexCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
const darkBlock = indexCss.match(
  /\/\* Berry Cream after dark \*\/[\s\S]*?--scrollbar-thumb-border:[^;]+;/
)?.[0];

describe('Berry Cream after dark tokens', () => {
  it('uses a lifted Berry Cream after dark navy instead of Catppuccin Macchiato', () => {
    expect(darkBlock).toBeDefined();
    expect(darkBlock).toContain('--background: 240 42% 14%');
    expect(darkBlock).toContain('--foreground: 300 24% 96%');
    expect(darkBlock).toContain('--card: 250 34% 18%');
    expect(darkBlock).toContain('--primary: 336 84% 75%');
    expect(darkBlock).toContain('--accent: 267 88% 81%');
    expect(darkBlock).toContain('--destructive: 0 65% 48%');
    expect(darkBlock).toContain('--destructive-text: 0 80% 72%');
    expect(darkBlock).toContain('--glass-bg: 250 34% 18% / 0.74');
    expect(darkBlock).toContain('ellipse 120% 76% at 50% 118%');
    expect(darkBlock).toContain('hsl(271 28% 52% / 0.45)');
    expect(darkBlock).not.toContain('--primary: 267 83% 80%');
    expect(darkBlock).not.toContain('--accent: 189 59% 73%');
    expect(darkBlock).not.toContain('--background: 232 23% 18%');
    expect(darkBlock).not.toContain('hsl(262 65% 43%)');
  });
});

describe('product page atmosphere', () => {
  it('keeps the Light wash and Dark bloom on a viewport-fixed layer', () => {
    const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

    expect(indexHtml).toContain('class="page-atmosphere"');
    expect(indexCss).toContain('.page-atmosphere');
    expect(indexCss).toContain('position: fixed');
    expect(indexCss).toContain('background-image: var(--page-atmosphere)');
    expect(indexCss).toContain('linear-gradient(');
    expect(indexCss).toContain('hsl(340 79% 96%)');
    expect(indexCss).toContain('hsl(259 74% 93%)');
    expect(indexCss).toMatch(/\.aurora-bg\s*\{\s*background-color:\s*transparent;/);
    expect(indexCss).toMatch(
      /html\.utility-register \.page-atmosphere\s*\{[^}]*background-image:\s*none;/
    );
    expect(indexCss).toMatch(
      /html\.utility-register \.mobile-app-container\s*\{[^}]*background-color:\s*hsl\(var\(--background\)\);/
    );
  });
});

describe('Paper Register dark softening', () => {
  it('uses toasted cream paper tokens against the navy stage', () => {
    const paperDarkBlock = indexCss.match(/\.dark\s*\{[^}]*--paper-bg:[^}]+\}/)?.[0];

    expect(paperDarkBlock).toBeDefined();
    expect(paperDarkBlock).toContain('--paper-bg: 36 38% 85%');
    expect(paperDarkBlock).toContain('--paper-edge: 35 22% 78%');
    expect(paperDarkBlock).toContain('--paper-bg-warm: 38 42% 88%');
    expect(paperDarkBlock).not.toContain('--paper-bg: 338 40% 90%');
    expect(paperDarkBlock).not.toContain('--paper-bg-warm: 340 45% 92%');
  });
});
