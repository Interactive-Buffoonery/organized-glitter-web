import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const indexCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

const getCssBlock = (selector: string) =>
  indexCss.match(new RegExp(`${selector.replace('.', '\\.')}\\s*\\{[\\s\\S]*?\\n\\s*\\}`))?.[0] ??
  '';

describe('keyboard-safe dialog CSS', () => {
  it('does not rely on individual translate for progress note dialog positioning', () => {
    const progressBlock = getCssBlock('.progress-note-dialog-content');

    expect(progressBlock).not.toContain('translate:');
  });

  it('keeps default keyboard-safe dialogs compact on mobile', () => {
    const keyboardSafeBlock = getCssBlock('.keyboard-safe-dialog-content');

    expect(keyboardSafeBlock).not.toContain('translate:');
    expect(keyboardSafeBlock).toContain('top: 50% !important');
    expect(keyboardSafeBlock).toContain('left: 50% !important');
    expect(keyboardSafeBlock).toContain('width: min(calc(100vw - 2rem), 32rem) !important');
    expect(keyboardSafeBlock).toContain('max-height: min(720px, 90dvh) !important');
    expect(keyboardSafeBlock).toContain('transform: translate(-50%, -50%) !important');
    expect(keyboardSafeBlock).not.toContain('height: 100dvh !important');
    expect(keyboardSafeBlock).not.toContain('--og-visual-viewport-height');
    expect(keyboardSafeBlock).not.toContain('--og-visual-viewport-width');
  });

  it('uses a mobile sheet layout only for opt-in keyboard-safe sheet dialogs', () => {
    const keyboardSafeSheetBlock = getCssBlock('.keyboard-safe-sheet-dialog-content');

    expect(keyboardSafeSheetBlock).not.toContain('translate:');
    expect(keyboardSafeSheetBlock).toContain('inset: 0 !important');
    expect(keyboardSafeSheetBlock).toContain('width: 100vw !important');
    expect(keyboardSafeSheetBlock).toContain('height: 100dvh !important');
    expect(keyboardSafeSheetBlock).toContain('max-height: none !important');
    expect(keyboardSafeSheetBlock).toContain('transform: none !important');
    expect(keyboardSafeSheetBlock).not.toContain('--og-visual-viewport-height');
    expect(keyboardSafeSheetBlock).not.toContain('--og-visual-viewport-width');
  });

  it('keeps desktop keyboard-safe sheet dialogs centered and constrained', () => {
    const desktopBlock =
      indexCss.match(
        /@media \(min-width: 640px\) \{[\s\S]*?\.keyboard-safe-sheet-dialog-content\s*\{[\s\S]*?\n\s*\}\n\s*\}/
      )?.[0] ?? '';

    expect(desktopBlock).toContain('inset: auto !important');
    expect(desktopBlock).toContain('left: 50% !important');
    expect(desktopBlock).toContain('top: 50% !important');
    expect(desktopBlock).toContain('width: min(calc(100vw - 2rem), 32rem) !important');
    expect(desktopBlock).toContain('height: auto !important');
    expect(desktopBlock).toContain('max-height: min(720px, 90dvh) !important');
    expect(desktopBlock).toContain('transform: translate(-50%, -50%) !important');
  });

  it('does not accidentally apply sheet dimensions to compact keyboard-safe dialogs', () => {
    const keyboardSafeBlock = getCssBlock('.keyboard-safe-dialog-content');

    expect(keyboardSafeBlock).not.toContain('inset: 0 !important');
    expect(keyboardSafeBlock).not.toContain('height: 100dvh !important');
    expect(keyboardSafeBlock).not.toContain('max-height: none !important');
  });

  it('keeps compact keyboard-safe dialogs centered and constrained', () => {
    const keyboardSafeBlock = getCssBlock('.keyboard-safe-dialog-content');

    expect(keyboardSafeBlock).toContain('left: 50% !important');
    expect(keyboardSafeBlock).toContain('top: 50% !important');
    expect(keyboardSafeBlock).toContain('width: min(calc(100vw - 2rem), 32rem) !important');
    expect(keyboardSafeBlock).toContain('max-height: min(720px, 90dvh) !important');
    expect(keyboardSafeBlock).toContain('transform: translate(-50%, -50%) !important');
  });
});
