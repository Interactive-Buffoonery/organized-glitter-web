import { describe, expect, it } from 'vitest';

import {
  formatWedgeNumber,
  getRandomizerWheelLabelMode,
  getUprightLabelRotation,
  splitRandomizerWheelLabel,
} from '../randomizerWheelGeometry';

describe('randomizerWheelGeometry', () => {
  it('switches desktop wheels from names to numbers at 9 items', () => {
    expect(getRandomizerWheelLabelMode(8, false)).toBe('name');
    expect(getRandomizerWheelLabelMode(9, false)).toBe('number');
  });

  it('switches mobile wheels from names to numbers at 7 items', () => {
    expect(getRandomizerWheelLabelMode(6, true)).toBe('name');
    expect(getRandomizerWheelLabelMode(7, true)).toBe('number');
  });

  it('flips left-side label rotations upright', () => {
    expect(getUprightLabelRotation(45)).toBe(45);
    expect(getUprightLabelRotation(135)).toBe(315);
    expect(getUprightLabelRotation(225)).toBe(405);
    expect(getUprightLabelRotation(315)).toBe(315);
  });

  it('splits and truncates long names predictably', () => {
    expect(splitRandomizerWheelLabel('Amsterdam Canal Houses at Night', { maxChars: 12 })).toEqual([
      'Ams...',
      'Canal',
    ]);
  });

  it('formats wedge numbers as stable one-based labels', () => {
    expect(formatWedgeNumber(0)).toBe('1');
    expect(formatWedgeNumber(11)).toBe('12');
  });
});
