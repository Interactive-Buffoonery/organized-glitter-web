import { z } from 'zod';
import { colorKeyFieldsSchema } from '@/schemas/colorKeyFields';

const date = z
  .string()
  .min(1)
  .max(40)
  .refine(value => Number.isFinite(Date.parse(value.replace(' ', 'T'))));
export const archiveColorKeyMetadataSchema = colorKeyFieldsSchema
  .extend({
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
