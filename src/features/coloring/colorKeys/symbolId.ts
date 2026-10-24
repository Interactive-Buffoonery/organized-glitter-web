// Catalog-free so schemas can validate IDs without bundling symbolCatalog.json.
export const SYMBOL_ID_PATTERN =
  /^(u:(?:[0-9A-CE-F][0-9A-F]{3}|D[0-7][0-9A-F]{2}|[1-9A-F][0-9A-F]{4}|10[0-9A-F]{4})(-(?:[0-9A-CE-F][0-9A-F]{3}|D[0-7][0-9A-F]{2}|[1-9A-F][0-9A-F]{4}|10[0-9A-F]{4}))*|c:[a-z0-9-]{1,48}|r:[a-z0-9]{15})$/;

export type ParsedSymbolId =
  | { kind: 'unicode'; text: string }
  | { kind: 'custom'; slug: string }
  | { kind: 'request'; requestId: string };

function isUnicodeScalar(value: number): boolean {
  return value <= 0x10ffff && (value < 0xd800 || value > 0xdfff);
}

export function parseSymbolId(id: string): ParsedSymbolId | null {
  if (id.match(SYMBOL_ID_PATTERN)?.[0] !== id) return null;
  const value = id.slice(2);
  if (id.startsWith('c:')) return { kind: 'custom', slug: value };
  if (id.startsWith('r:')) return { kind: 'request', requestId: value };
  const points = value.split('-').map(hex => parseInt(hex, 16));
  return { kind: 'unicode', text: String.fromCodePoint(...points) };
}

export function isSymbolId(id: string): boolean {
  return parseSymbolId(id) !== null;
}

const VARIATION_SELECTORS = /[\uFE0E\uFE0F]/gu;

export function unicodeSymbolId(text: string): string {
  const points = Array.from(text.replace(VARIATION_SELECTORS, ''), char => char.codePointAt(0)!);
  if (!points.length) throw new Error('A Unicode symbol must contain at least one code point');
  if (!points.every(isUnicodeScalar))
    throw new Error('A Unicode symbol must contain valid scalar values');
  return `u:${points.map(point => point.toString(16).toUpperCase().padStart(4, '0')).join('-')}`;
}
