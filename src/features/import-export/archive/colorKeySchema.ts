import { z } from 'zod';
import { isSymbolId } from '@/features/coloring/colorKeys/symbols';

const text = (max: number) => z.string().refine(value => Array.from(value).length <= max);
const date = z
  .string()
  .min(1)
  .max(40)
  .refine(value => Number.isFinite(Date.parse(value)));
export const archiveColorKeyMetadataSchema = z
  .object({
    position: z.number().int().nonnegative(),
    symbol: text(64).refine(isSymbolId),
    code: text(100),
    color_name: text(100),
    swatch: z.string().refine(value => value === '' || /^#[0-9a-fA-F]{6}$/.test(value)),
    tried: z.array(text(100)).max(20),
    note: text(2000),
    created: date,
    updated: date,
  })
  .strict();
export const archiveColorKeySchema = archiveColorKeyMetadataSchema.extend({
  ref: z
    .string()
    .regex(/^coloring-color-key:[a-z0-9][a-z0-9:._-]*$/)
    .max(255),
});
