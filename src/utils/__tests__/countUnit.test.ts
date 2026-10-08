import { describe, expect, it } from 'vitest';
import { countUnit } from '../countUnit';

describe('countUnit', () => {
  it.each([
    [0, 'page', 'pages'],
    [1, 'page', 'page'],
    [2, 'page', 'pages'],
    [1, 'painting', 'painting'],
    [2, 'painting', 'paintings'],
  ] as const)('labels %s %s as %s', (count, unit, expected) => {
    expect(countUnit(count, unit)).toBe(expected);
  });
});
