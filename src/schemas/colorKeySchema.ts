import { z } from 'zod';
import { isSymbolId } from '@/features/coloring/colorKeys/symbols';
import { COLOR_KEY_LIMITS, colorKeyText } from '@/schemas/colorKeyFields';
export { COLOR_KEY_LIMITS } from '@/schemas/colorKeyFields';

const text = (label: string, max: number) => colorKeyText(label, max, true);

export const colorKeyInputSchema = z.object({
  symbol: z.string().refine(isSymbolId, 'Choose a valid symbol.'),
  position: z.number().int().min(0, 'Choose a valid position.'),
  code: text('Code', COLOR_KEY_LIMITS.code).optional(),
  color_name: text('Color name', COLOR_KEY_LIMITS.colorName).optional(),
  swatch: z
    .string()
    .trim()
    .regex(/^(#[0-9a-fA-F]{6})?$/, 'Swatch must be a color like #A1B2C3.')
    .optional(),
  tried: z
    .array(text('Tried codes', COLOR_KEY_LIMITS.code))
    .transform(values => values.filter(Boolean))
    .refine(
      values => values.length <= COLOR_KEY_LIMITS.tried,
      `Tried codes can list up to ${COLOR_KEY_LIMITS.tried} codes.`
    )
    .optional(),
  note: text('Note', COLOR_KEY_LIMITS.note).optional(),
});

export type ColorKeyInput = z.input<typeof colorKeyInputSchema>;

export function parseColorKeyInput<T extends Partial<ColorKeyInput>>(
  input: T,
  partial: boolean
): Partial<z.output<typeof colorKeyInputSchema>> {
  const schema = partial ? colorKeyInputSchema.partial() : colorKeyInputSchema;
  const result = schema.safeParse(input);
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? 'Check this color.');
  return result.data;
}
