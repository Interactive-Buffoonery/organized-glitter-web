const RESERVED_TAXONOMY_NAMES = new Set([
  'unknown',
  'other',
  'unknown other',
  'n a',
  'none',
  'unspecified',
]);

export function normalizeTaxonomyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\p{P}\p{S}_/]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isReservedTaxonomyName(name: string | null | undefined): boolean {
  if (!name) return false;
  return RESERVED_TAXONOMY_NAMES.has(normalizeTaxonomyName(name));
}

export const isPlaceholderLikeTaxonomyName = isReservedTaxonomyName;
