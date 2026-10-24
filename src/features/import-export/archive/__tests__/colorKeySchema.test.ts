import { describe, expect, it, vi } from 'vitest';
import { archiveColorKeyMetadataSchema } from '../colorKeySchema';

const metadata = {
  position: 0,
  symbol: 'u:0031',
  code: '',
  color_name: '',
  swatch: '',
  tried: [],
  note: '',
  created: '2026-01-01 00:00:00.000Z',
  updated: '2026-01-01 00:00:00.000Z',
};
describe('archive key validation', () => {
  it('normalizes PocketBase timestamps before Safari-style parsing', () => {
    const parse = Date.parse;
    const spy = vi
      .spyOn(Date, 'parse')
      .mockImplementation(value => (value.includes(' ') ? NaN : parse(value)));
    try {
      expect(() => archiveColorKeyMetadataSchema.parse(metadata)).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
  it('accepts 20 tried entries and rejects 21', () => {
    expect(() =>
      archiveColorKeyMetadataSchema.parse({ ...metadata, tried: Array(20).fill('001') })
    ).not.toThrow();
    expect(() =>
      archiveColorKeyMetadataSchema.parse({ ...metadata, tried: Array(21).fill('001') })
    ).toThrow();
  });
});
