import { describe, expect, it } from 'vitest';
import {
  clearOptionalRelation,
  normalizeOptionalRelation,
  POCKETBASE_RELATION_CLEAR_VALUE,
} from '../relationClear';

describe('PocketBase optional relation clear value', () => {
  it('uses the verified empty string clear value', () => {
    expect(clearOptionalRelation()).toBe('');
    expect(POCKETBASE_RELATION_CLEAR_VALUE).toBe('');
  });

  it('normalizes empty create relation values to omission', () => {
    expect(normalizeOptionalRelation('')).toBeUndefined();
    expect(normalizeOptionalRelation(null)).toBeUndefined();
    expect(normalizeOptionalRelation('rel-1')).toBe('rel-1');
  });
});
