import { z } from 'zod';
import { isSymbolId } from '@/features/coloring/colorKeys/symbols';

export const COLOR_KEY_LIMITS = {
  symbol: 64,
  code: 100,
  colorName: 100,
  tried: 20,
  note: 2000,
} as const;

// PocketBase counts Unicode characters rather than UTF-16 code units.
export const colorKeyText = (label: string, max: number, trim = false) =>
  (trim ? z.string().trim() : z.string()).refine(
    value => Array.from(value).length <= max,
    `${label} can be up to ${max} characters.`
  );

export const colorKeyFieldsSchema = z.object({
  position: z.number().int().nonnegative(),
  symbol: colorKeyText('Symbol', COLOR_KEY_LIMITS.symbol).refine(isSymbolId),
  code: colorKeyText('Code', COLOR_KEY_LIMITS.code),
  color_name: colorKeyText('Color name', COLOR_KEY_LIMITS.colorName),
  swatch: z.string().regex(/^(#[0-9a-fA-F]{6})?$/),
  tried: z.array(colorKeyText('Tried codes', COLOR_KEY_LIMITS.code)).max(COLOR_KEY_LIMITS.tried),
  note: colorKeyText('Note', COLOR_KEY_LIMITS.note),
});
