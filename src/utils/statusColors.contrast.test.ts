import { describe, expect, it } from 'vitest';
import { FILTER_STATUS_ACTIVE_FILL, COLORING_BOOK_STATUS_FILL } from './statusColors';

const colors: Record<string, string> = {
  'rose-700': '#be123c',
  'sky-700': '#0369a1',
  'orange-700': '#c2410c',
  'teal-700': '#0f766e',
  'diamond-700': '#7e22ce',
  'amber-800': '#92400e',
  'emerald-700': '#047857',
  'slate-600': '#475569',
};
function contrast(hex: string) {
  const rgb = hex
    .slice(1)
    .match(/../g)!
    .map(c => parseInt(c, 16) / 255)
    .map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 1.05 / (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] + 0.05);
}
describe('solid status contrast', () => {
  for (const [status, classes] of Object.entries({
    ...FILTER_STATUS_ACTIVE_FILL,
    ...COLORING_BOOK_STATUS_FILL,
  })) {
    if (status === 'everything') continue;
    it(`${status} meets AA with white in both themes`, () => {
      expect(classes).toContain('text-white');
      const fills = [...classes.matchAll(/(?:^|\s)(?:dark:)?bg-([\w-]+)/g)];
      expect(fills.length).toBeGreaterThan(0);
      for (const [, name] of fills) {
        expect(colors[name], name).toBeDefined();
        expect(contrast(colors[name])).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
