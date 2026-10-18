import { describe, expect, it } from 'vitest';

import catalog from './symbolCatalog.json';
import {
  DEFAULT_SETUP_SYMBOLS,
  SYMBOL_ID_PATTERN,
  getCatalogSymbol,
  isSymbolId,
  parseSymbolId,
  searchSymbols,
  symbolLabel,
  symbolsByGroup,
  unicodeSymbolId,
} from './symbols';

const groups = [
  'numbers',
  'lowercase',
  'uppercase',
  'greek',
  'money',
  'math',
  'music',
  'signs',
  'letters-extra',
  'shapes',
];

describe('symbol catalog contract', () => {
  it('uses version 1 and all contract groups in display order', () => {
    expect(catalog.version).toBe(1);
    expect(catalog.groups.map(({ id }) => id)).toEqual(groups);
    for (const { id, label } of catalog.groups) {
      expect(label.trim()).not.toBe('');
      expect(symbolsByGroup[id].length).toBeGreaterThan(0);
      expect(symbolsByGroup[id]).toEqual(catalog.symbols.filter(symbol => symbol.group === id));
    }
  });

  it('contains unique valid IDs, lowercase keywords and usable names', () => {
    expect(new Set(catalog.symbols.map(({ id }) => id)).size).toBe(catalog.symbols.length);
    for (const symbol of catalog.symbols) {
      expect(symbol.id).toMatch(SYMBOL_ID_PATTERN);
      expect(isSymbolId(symbol.id)).toBe(true);
      expect(groups).toContain(symbol.group);
      expect(symbol.name.trim()).not.toBe('');
      expect(symbol.keywords.length).toBeGreaterThan(0);
      for (const keyword of symbol.keywords) {
        expect(keyword.trim()).not.toBe('');
        expect(keyword).toBe(keyword.toLowerCase());
      }
      if (symbol.id.startsWith('u:')) {
        expect(symbol).not.toHaveProperty('path');
        expect(symbol).toHaveProperty(
          'char',
          String.fromCodePoint(
            ...symbol.id
              .slice(2)
              .split('-')
              .map(hex => parseInt(hex, 16))
          )
        );
      } else {
        expect(symbol.id).toMatch(/^c:/);
        expect(symbol).not.toHaveProperty('char');
        expect(symbol).toHaveProperty('path');
        const path = 'path' in symbol ? symbol.path : '';
        expect(path).toMatch(/^[MLHV CQAZmlhvcqaz0-9.,+\-\s]+$/);
        expect(path).toMatch(/^[Mm]/);
      }
    }
  });

  it('covers requested alphabets, symbols and custom shapes', () => {
    const required =
      '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZψφδωσλπμθΨΦΔΩΣΛΠΜΘ$€£¥₪₸¢₹₩₽₺₿+-×÷=≈≠≤≥∑∏√∞∫∂∆∇∈∩∪⊂⊃⋔±°‰♪♫♩♬♭♮♯𝄞#@%&§¶©®™*†‡?!¿¡><♀♂☼☀☾★☆♠♣♥♦♄☺œæøßðþŋʃʒƒﬀЖЊѦɄꜨꙍꭓƳṡᴥЧШЯФЮБДЛП◊○●□■△▲▽◇◆◎⊙⊕⊗✕✓♢';
    for (const char of required) expect(getCatalogSymbol(unicodeSymbolId(char))?.char).toBe(char);
    for (const slug of [
      'linked-circles',
      'curled-triangle',
      'spiral-square',
      'crossed-ribbons',
      'lightning',
      'circled-dot',
      'w-over-w',
    ]) {
      expect(getCatalogSymbol(`c:${slug}`)?.path).toBeTruthy();
    }
  });
});

describe('symbol IDs', () => {
  it('preserves the exact shared validation pattern', () => {
    expect(SYMBOL_ID_PATTERN.source).toBe(
      '^(u:[0-9A-F]{4,6}(-[0-9A-F]{4,6})*|c:[a-z0-9-]{1,48}|r:[a-z0-9]{15})$'
    );
  });

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

  it.each([
    '',
    'u:abc',
    'u:03c8',
    'u:110000',
    'u:D800',
    'u:DFFF',
    'u:0041-',
    'c:Upper',
    'c:' + 'a'.repeat(49),
    'r:short',
    'r:ABC123def456ghi',
    'u:0041\n',
    'u:0041\r',
    'u:0041\u2028',
    'c:unknown\u2029',
  ])('rejects invalid ID %j without throwing', id => {
    expect(isSymbolId(id)).toBe(false);
    expect(parseSymbolId(id)).toBeNull();
  });

  it('builds IDs by code point without normalizing or changing case', () => {
    expect(unicodeSymbolId('A𝄞́')).toBe('u:0041-1D11E-0301');
    expect(unicodeSymbolId('a')).toBe('u:0061');
    expect(() => unicodeSymbolId('')).toThrow();
    expect(() => unicodeSymbolId('\uD800')).toThrow();
  });

  it('provides setup IDs in contract order', () => {
    expect(DEFAULT_SETUP_SYMBOLS).toEqual(
      Array.from('1234567890abcdefghijklmnopqrstuvwxyz', unicodeSymbolId)
    );
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

  it('ranks exact characters before name prefixes, keyword prefixes and substrings', () => {
    for (const query of ['a', 'pi', 'circle', 'triangle', 'y']) {
      const rank = (symbol: (typeof catalog.symbols)[number]) => {
        if (symbol.char?.toLowerCase() === query) return 0;
        if (symbol.name.toLowerCase().startsWith(query)) return 1;
        if (symbol.keywords.some(keyword => keyword.startsWith(query))) return 2;
        return 3;
      };
      const results = searchSymbols(query);
      expect(results.length).toBeGreaterThan(1);
      expect(results.map(rank)).toEqual(results.map(rank).sort((a, b) => a - b));
    }
    expect(searchSymbols('ψ')[0].id).toBe('u:03C8');
    expect(searchSymbols(' PI ')).toEqual(searchSymbols('pi'));
    expect(searchSymbols('trident').map(({ id }) => id)).toContain('u:03C8');
    expect(searchSymbols('y with lines').map(({ id }) => id)).toContain('u:00A5');
    expect(searchSymbols('not a real symbol')).toEqual([]);
    expect(searchSymbols('  ')).toEqual(catalog.symbols);
  });
});
