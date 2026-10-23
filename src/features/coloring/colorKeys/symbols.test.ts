import { describe, expect, it } from 'vitest';
import { getCatalogSymbol, parseSymbolId, symbolLabel } from './symbols';

describe('symbol IDs', () => {
  it('parses Unicode sequences, custom shapes and requests', () => {
    expect(parseSymbolId('u:03C8')).toEqual({ kind: 'unicode', text: 'ψ' });
    expect(parseSymbolId('u:1D11E-0301')).toEqual({ kind: 'unicode', text: '𝄞́' });
    expect(parseSymbolId('c:unknown')).toEqual({ kind: 'custom', slug: 'unknown' });
    expect(parseSymbolId('r:abc123def456ghi')).toEqual({
      kind: 'request',
      requestId: 'abc123def456ghi',
    });
    expect(parseSymbolId('c:' + 'a'.repeat(48))).not.toBeNull();
    expect(parseSymbolId('u:10FFFF')).not.toBeNull();
  });
});

describe('symbol lookup, search and labels', () => {
  it('looks up known symbols and handles unknown IDs', () => {
    expect(getCatalogSymbol('u:03C8')?.name).toBe('Psi');
    expect(getCatalogSymbol('c:missing')).toBeUndefined();
    expect(symbolLabel('u:6F22')).toBe('漢');
    expect(parseSymbolId('u:6F22')).toEqual({ kind: 'unicode', text: '漢' });
    expect(symbolLabel('u:0041-0301')).toBe('Á');
    expect(symbolLabel('c:linked-circles')).toBe('Linked circles');
    expect(symbolLabel('c:missing')).toBe('Unknown symbol');
    expect(symbolLabel('invalid')).toBe('Unknown symbol');
    expect(symbolLabel('r:abc123def456ghi')).toBe('Sent symbol');
    expect(symbolLabel('r:abc123def456ghi', { requestDescription: 'Two stacked Ws' })).toBe(
      'Two stacked Ws'
    );
    expect(symbolLabel('r:abc123def456ghi', { requestDescription: '  ' })).toBe('Sent symbol');
  });
});
