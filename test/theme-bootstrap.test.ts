import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

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

describe.each(['index.html', 'landing.html', 'about.html'])('%s theme bootstrap', file => {
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

const themeColorScript = readFileSync(resolve(process.cwd(), 'public/theme-color.js'), 'utf8');

interface ThemeColorHarness {
  document: Document;
  meta: HTMLMetaElement;
  setSystemDark: (matches: boolean) => void;
  triggerMutation: (attributeName: 'class' | 'data-theme') => void;
  triggerSystemThemeChange: () => void;
}

const runThemeColorScript = (
  source = themeColorScript,
  {
    dispatchReady = true,
    prefersDark = false,
  }: { dispatchReady?: boolean; prefersDark?: boolean } = {}
): ThemeColorHarness => {
  const controlledDocument = document.implementation.createHTMLDocument('Theme color test');
  const meta = controlledDocument.createElement('meta');
  meta.setAttribute('name', 'theme-color');
  meta.setAttribute('media', '(prefers-color-scheme: light)');
  controlledDocument.head.append(meta);

  let systemDark = prefersDark;
  let mutationCallback: MutationCallback | undefined;
  let systemThemeListener: (() => void) | undefined;
  const observedAttributes = new Map<Node, Set<string>>();

  class ControlledMutationObserver {
    constructor(callback: MutationCallback) {
      mutationCallback = callback;
    }

    observe = vi.fn((target: Node, options: MutationObserverInit) => {
      observedAttributes.set(target, new Set(options.attributeFilter ?? []));
    });
    disconnect = vi.fn();
    takeRecords = vi.fn(() => []);
  }

  const matchMedia = vi.fn(() => ({
    get matches() {
      return systemDark;
    },
    addEventListener: vi.fn((event: string, listener: () => void) => {
      if (event === 'change') systemThemeListener = listener;
    }),
  }));

  runInNewContext(source, {
    document: controlledDocument,
    window: { matchMedia },
    MutationObserver: ControlledMutationObserver,
  });
  if (dispatchReady) controlledDocument.dispatchEvent(new Event('DOMContentLoaded'));

  return {
    document: controlledDocument,
    meta,
    setSystemDark: matches => {
      systemDark = matches;
    },
    triggerMutation: attributeName => {
      if (observedAttributes.get(controlledDocument.documentElement)?.has(attributeName)) {
        mutationCallback?.([{ attributeName } as MutationRecord], {} as MutationObserver);
      }
    },
    triggerSystemThemeChange: () => systemThemeListener?.(),
  };
};

describe('pre-React theme colors', () => {
  it.each([
    { prefersDark: false, expectedColor: '#f8e8f6' },
    { prefersDark: true, expectedColor: '#151533' },
  ])('sets the initial meta color from the system theme', ({ prefersDark, expectedColor }) => {
    const { meta } = runThemeColorScript(themeColorScript, { dispatchReady: false, prefersDark });

    expect(meta.getAttribute('content')).toBe(expectedColor);
    expect(meta.hasAttribute('media')).toBe(false);
  });

  it('updates the meta color when the selected theme changes', () => {
    const harness = runThemeColorScript();

    harness.document.documentElement.classList.add('dark');
    harness.triggerMutation('class');
    expect(harness.meta.getAttribute('content')).toBe('#151533');

    harness.document.documentElement.classList.remove('dark');
    harness.document.documentElement.setAttribute('data-theme', 'light');
    harness.triggerMutation('data-theme');
    expect(harness.meta.getAttribute('content')).toBe('#f8e8f6');
  });

  it('uses system theme changes when no explicit theme is selected', () => {
    const harness = runThemeColorScript();

    harness.setSystemDark(true);
    harness.triggerSystemThemeChange();
    expect(harness.meta.getAttribute('content')).toBe('#151533');

    harness.setSystemDark(false);
    harness.triggerSystemThemeChange();
    expect(harness.meta.getAttribute('content')).toBe('#f8e8f6');
  });

  it('fails its behavior checks if updates are removed from the source fixture', () => {
    const withoutInitialUpdate = themeColorScript.replace(
      '// Run as soon as possible so the status bar matches before first paint.\nupdateThemeColor();',
      ''
    );
    const withoutObserverUpdate = themeColorScript.replace(
      "if (mutation.attributeName === 'class' || mutation.attributeName === 'data-theme') {\n          updateThemeColor();\n        }",
      "if (mutation.attributeName === 'class' || mutation.attributeName === 'data-theme') {}"
    );

    expect(withoutInitialUpdate).not.toBe(themeColorScript);
    expect(withoutObserverUpdate).not.toBe(themeColorScript);

    expect(() => {
      const { meta } = runThemeColorScript(withoutInitialUpdate, {
        dispatchReady: false,
        prefersDark: true,
      });
      expect(meta.getAttribute('content')).toBe('#151533');
    }).toThrow();

    expect(() => {
      const harness = runThemeColorScript(withoutObserverUpdate);
      harness.document.documentElement.classList.add('dark');
      harness.triggerMutation('class');
      expect(harness.meta.getAttribute('content')).toBe('#151533');
    }).toThrow();
  });
});
