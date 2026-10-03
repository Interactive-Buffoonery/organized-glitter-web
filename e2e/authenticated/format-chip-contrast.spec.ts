/**
 * FormatChip color-contrast (#103).
 *
 * The authenticated axe sweeps disable the `color-contrast` rule (see
 * expectNoStructuralAxeViolations in ../a11y/axe-test.ts), so a contrast
 * regression on FormatChip would never be caught there. This spec verifies the
 * WCAG AA contrast fix directly on the rendered chip, in BOTH themes.
 *
 * Both themes matter: FormatChip is `text-foreground` on `bg-muted/60`, both of
 * which are theme tokens. The app and E2E account both default to `system`, so
 * `page.emulateMedia({ colorScheme })` flips the resolved theme without
 * mutating the shared account preference.
 *
 * Why a computed-style check and not a focused axe run: FormatChip uses an alpha
 * background (`bg-muted/60`, resolved as `oklab(... / 0.6)`) inside a glass panel.
 * axe-core's color-contrast rule cannot composite that alpha layer here and marks
 * the rule INAPPLICABLE for the chip (verified empirically against the preview) -
 * so a scoped axe scan reports zero violations without ever evaluating contrast,
 * a vacuous pass. Instead this spec composites the actual rendered colors and
 * computes the WCAG contrast ratio itself.
 *
 * The compositing is done by the browser's own canvas rasterizer: painting the
 * chip's alpha background over its first opaque ancestor, then the text color
 * over that result, yields true sRGB pixels even for oklab/oklch + alpha that
 * `getComputedStyle` leaves unresolved. The ratio is then computed with the WCAG
 * relative-luminance formula.
 *
 * Lives under e2e/authenticated/ (not e2e/a11y/) because only that project's
 * testMatch picks up arbitrary *.spec.ts; the a11y project allowlists specific
 * filenames.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';

import { waitForAccessibilityScanReady } from '../a11y/axe-test';

// FormatChip's distinctive class signature: a monospaced, uppercased chip.
const CHIP_SELECTOR = 'span.font-mono.uppercase';

// WCAG 2.1 AA minimum contrast ratio for normal-size text. The chip text is
// 10px (small text), so the 4.5:1 normal-text threshold applies, not 3:1.
const WCAG_AA_NORMAL_TEXT = 4.5;

interface ChipContrast {
  ratio: number;
  fontSize: string;
  /** Relative luminance of the composited chip background (0..1). */
  backgroundLuminance: number;
  /** Whether <html> carries the `.dark` Tailwind bridge class. */
  htmlIsDark: boolean;
}

const measureChipContrast = async (chip: Locator): Promise<ChipContrast> =>
  chip.evaluate(el => {
    // Paint a CSS color onto a 4x4 canvas (optionally over a base color) and
    // read back the rendered sRGB pixel. The rasterizer resolves oklab/oklch and
    // alpha that getComputedStyle leaves verbatim, and composites for us.
    const sample = (cssColor: string, base: string | null) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 4;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2d canvas context unavailable');
      if (base) {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, 4, 4);
      }
      ctx.fillStyle = cssColor;
      ctx.fillRect(0, 0, 4, 4);
      const [r, g, b, a] = ctx.getImageData(2, 2, 1, 1).data;
      return { r, g, b, a: a / 255 };
    };

    const cs = getComputedStyle(el);

    // The effective backdrop is the first opaque ancestor background.
    let node: HTMLElement | null = el.parentElement;
    let backdrop = 'rgb(255, 255, 255)';
    while (node) {
      const bg = getComputedStyle(node).backgroundColor;
      const probed = sample(bg, null);
      const isTransparent = probed.a < 0.999;
      if (!isTransparent) {
        backdrop = bg;
        break;
      }
      node = node.parentElement;
    }

    // Composite the chip's (alpha) background over the backdrop, then the text
    // color over that result.
    const effectiveBg = sample(cs.backgroundColor, backdrop);
    const effectiveBgCss = `rgb(${effectiveBg.r}, ${effectiveBg.g}, ${effectiveBg.b})`;
    const effectiveFg = sample(cs.color, effectiveBgCss);

    const channel = (value: number) => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const luminance = (c: { r: number; g: number; b: number }) =>
      0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);

    const l1 = luminance(effectiveFg);
    const l2 = luminance(effectiveBg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

    return {
      ratio,
      fontSize: cs.fontSize,
      backgroundLuminance: l2,
      htmlIsDark: document.documentElement.classList.contains('dark'),
    };
  });

/**
 * INT-1056: Full-suite hosted runs could leave auth `storageState` with
 * ThemeProvider's default `light` in localStorage. Dark then depended on
 * AccountThemeSync fetching the profile and calling `setTheme('system')`,
 * which often missed a 10s `.dark`-only poll under PocketBase load.
 *
 * Pin `theme=system` before navigation so the HTML bootstrap + next-themes
 * follow `emulateMedia` immediately, then wait for media, `data-theme`, and
 * the Tailwind `.dark` bridge together (same readiness style as INT-1057).
 */
const prepareSystemColorScheme = async (page: Page, colorScheme: 'light' | 'dark') => {
  await page.addInitScript(() => {
    window.localStorage.setItem('theme', 'system');
  });
  await page.emulateMedia({ colorScheme });
};

const waitForResolvedColorScheme = async (page: Page, expectDark: boolean) => {
  await waitForAccessibilityScanReady(page);

  await page.waitForFunction(
    wantDark => window.matchMedia(`(prefers-color-scheme: ${wantDark ? 'dark' : 'light'})`).matches,
    expectDark,
    { timeout: 10_000 }
  );

  const html = page.locator('html');
  const expectedTheme = expectDark ? 'dark' : 'light';

  // Bootstrap, next-themes hydration, ThemeClassSync, and AccountThemeSync can
  // briefly disagree under load. Poll until attribute + class + media agree.
  await expect(async () => {
    await expect(html).toHaveAttribute('data-theme', expectedTheme);

    if (expectDark) {
      await expect(html).toHaveClass(/(^|\s)dark(\s|$)/);
    } else {
      await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/);
    }

    const mediaMatches = await page.evaluate(
      wantDark =>
        window.matchMedia(`(prefers-color-scheme: ${wantDark ? 'dark' : 'light'})`).matches,
      expectDark
    );
    expect(mediaMatches).toBe(true);

    const storedTheme = await page.evaluate(() => window.localStorage.getItem('theme'));
    expect(storedTheme, 'client theme preference must stay system for OS emulation').toBe('system');
  }).toPass({ timeout: 20_000, intervals: [50, 100, 250, 500, 1_000] });
};

const themeCases = [
  { colorScheme: 'light' as const, expectDark: false },
  { colorScheme: 'dark' as const, expectDark: true },
];

test.describe('FormatChip contrast', () => {
  for (const { colorScheme, expectDark } of themeCases) {
    test(`meets WCAG AA color contrast in ${colorScheme} theme`, async ({ page }) => {
      // The account theme is `system`, so emulating the OS color scheme flips the
      // resolved theme without mutating the shared account preference.
      await prepareSystemColorScheme(page, colorScheme);
      await page.goto('/profile?tab=data');

      // The Data tab renders the import/export sections that contain the chips.
      await expect(page.getByRole('tab', { name: 'Data', selected: true })).toBeVisible({
        timeout: 15_000,
      });

      const chip = page.locator(CHIP_SELECTOR).first();
      await expect(chip).toBeVisible({ timeout: 15_000 });
      // Sanity-check the selector resolves to a real format chip, not some other
      // monospaced uppercase span.
      await expect(chip).toHaveText(/\.(zip|csv)|folder/i);

      await waitForResolvedColorScheme(page, expectDark);

      const { ratio, fontSize, backgroundLuminance, htmlIsDark } = await measureChipContrast(chip);

      // Safeguard against a vacuous pass: confirm the composited backdrop is the
      // right theme before trusting the ratio. The backdrop walk defaults to
      // white if it finds no opaque ancestor, which would silently fake a light
      // background under a dark theme. A dark theme must yield a dark backdrop.
      expect(htmlIsDark, 'resolved theme must match the emulated color scheme').toBe(expectDark);
      if (expectDark) {
        expect(
          backgroundLuminance,
          `dark-theme chip backdrop luminance (${backgroundLuminance.toFixed(3)}) must be dark, ` +
            'not the white fallback'
        ).toBeLessThan(0.3);
      } else {
        expect(
          backgroundLuminance,
          `light-theme chip backdrop luminance (${backgroundLuminance.toFixed(3)}) must be light`
        ).toBeGreaterThan(0.5);
      }

      expect(
        ratio,
        `FormatChip ${colorScheme} contrast (${ratio.toFixed(2)}:1 at ${fontSize}) must meet ` +
          `WCAG AA (${WCAG_AA_NORMAL_TEXT}:1)`
      ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    });
  }
});
