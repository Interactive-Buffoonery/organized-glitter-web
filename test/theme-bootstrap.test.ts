import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const readBootstrap = (file: string): string => {
  const html = readFileSync(resolve(process.cwd(), file), 'utf8');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(match =>
    match[1].includes("localStorage.getItem('theme')")
  )?.[1];

  if (!script) throw new Error(`Theme bootstrap script missing from ${file}`);
  return script;
};

interface BootstrapResult {
  isDark: boolean;
  storedTheme: string | null;
}

const runBootstrap = (
  script: string,
  stored: string | null,
  prefersDark: boolean
): BootstrapResult => {
  const root = document.createElement('html');
  let storedTheme = stored;

  runInNewContext(script, {
    localStorage: {
      getItem: () => storedTheme,
      setItem: (_key: string, value: string) => {
        storedTheme = value;
      },
    },
    window: { matchMedia: () => ({ matches: prefersDark }) },
    document: { documentElement: root },
  });

  const isDark = root.classList.contains('dark');
  expect(root.getAttribute('data-theme')).toBe(isDark ? 'dark' : 'light');
  return { isDark, storedTheme };
};

const resolvesDark = (script: string, stored: string | null, prefersDark: boolean): boolean =>
  runBootstrap(script, stored, prefersDark).isDark;

describe.each(['index.html', 'about.html'])('%s theme bootstrap', file => {
  const script = readBootstrap(file);

  it('defaults first visits to System and honors explicit System', () => {
    expect(resolvesDark(script, null, false)).toBe(false);
    expect(resolvesDark(script, null, true)).toBe(true);
    expect(resolvesDark(script, 'system', false)).toBe(false);
    expect(resolvesDark(script, 'system', true)).toBe(true);
  });

  it('treats invalid saved themes as System so dark-system visitors first-paint dark', () => {
    expect(resolvesDark(script, 'not-a-theme', true)).toBe(true);
    expect(resolvesDark(script, 'not-a-theme', false)).toBe(false);
    expect(resolvesDark(script, 'catppuccin-unknown', true)).toBe(true);
    expect(resolvesDark(script, '', true)).toBe(true);
  });

  it('maps current and legacy saved preferences before first paint', () => {
    expect(resolvesDark(script, 'light', true)).toBe(false);
    expect(resolvesDark(script, 'dark', false)).toBe(true);
    expect(resolvesDark(script, 'catppuccin-latte', true)).toBe(false);
    expect(resolvesDark(script, 'catppuccin-frappe', false)).toBe(true);
    expect(resolvesDark(script, 'catppuccin-macchiato', false)).toBe(true);
    expect(resolvesDark(script, 'catppuccin-mocha', false)).toBe(true);
  });

  it('normalizes legacy preferences before next-themes initializes', () => {
    expect(runBootstrap(script, 'catppuccin-latte', true).storedTheme).toBe('light');
    expect(runBootstrap(script, 'catppuccin-frappe', false).storedTheme).toBe('dark');
    expect(runBootstrap(script, 'catppuccin-macchiato', false).storedTheme).toBe('dark');
    expect(runBootstrap(script, 'catppuccin-mocha', false).storedTheme).toBe('dark');
  });

  it('rewrites unknown stored themes to system and leaves first visits unset', () => {
    expect(runBootstrap(script, 'not-a-theme', true).storedTheme).toBe('system');
    expect(runBootstrap(script, 'catppuccin-unknown', false).storedTheme).toBe('system');
    expect(runBootstrap(script, null, true).storedTheme).toBeNull();
    expect(runBootstrap(script, '', true).storedTheme).toBe('');
    expect(runBootstrap(script, 'system', true).storedTheme).toBe('system');
    expect(runBootstrap(script, 'light', true).storedTheme).toBe('light');
    expect(runBootstrap(script, 'dark', false).storedTheme).toBe('dark');
  });
});

describe('pre-React theme colors', () => {
  it('uses the current Light and Dark page colors', () => {
    const themeColorScript = readFileSync(resolve(process.cwd(), 'public/theme-color.js'), 'utf8');

    expect(themeColorScript).toContain("const LIGHT_COLOR = '#f8e8f6';");
    expect(themeColorScript).toContain("const DARK_COLOR = '#151533';");
  });
});
