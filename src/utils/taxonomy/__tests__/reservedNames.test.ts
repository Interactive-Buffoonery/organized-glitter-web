import { describe, expect, it } from 'vitest';
import {
  isPlaceholderLikeTaxonomyName,
  isReservedTaxonomyName,
  normalizeTaxonomyName,
} from '../reservedNames';

describe('reserved taxonomy names', () => {
  it.each([
    [' Unknown ', 'unknown'],
    ['Unknown/Other', 'unknown other'],
    ['N_A', 'n a'],
    ['unknown---other', 'unknown other'],
    ['Unspecified', 'unspecified'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeTaxonomyName(input)).toBe(expected);
  });

  it.each(['Unknown', 'Other', 'Unknown/Other', 'N/A', 'None', 'Unspecified', ' unknown_other '])(
    'classifies %s as placeholder-like',
    name => {
      expect(isReservedTaxonomyName(name)).toBe(true);
      expect(isPlaceholderLikeTaxonomyName(name)).toBe(true);
    }
  );

  it('allows normal taxonomy names', () => {
    expect(isReservedTaxonomyName('Prismacolor')).toBe(false);
  });
});
