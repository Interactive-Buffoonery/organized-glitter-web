import catalog from './symbolCatalog.json';

export const SYMBOL_ID_PATTERN =
  /^(u:(?:[0-9A-CE-F][0-9A-F]{3}|D[0-7][0-9A-F]{2}|[1-9A-F][0-9A-F]{4}|10[0-9A-F]{4})(-(?:[0-9A-CE-F][0-9A-F]{3}|D[0-7][0-9A-F]{2}|[1-9A-F][0-9A-F]{4}|10[0-9A-F]{4}))*|c:[a-z0-9-]{1,48}|r:[a-z0-9]{15})$/;

export type CatalogSymbol = (typeof catalog.symbols)[number];
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

const symbolsById = new Map(catalog.symbols.map(symbol => [symbol.id, symbol]));

export function getCatalogSymbol(id: string): CatalogSymbol | undefined {
  return symbolsById.get(id);
}

export const symbolsByGroup: Record<string, CatalogSymbol[]> = Object.fromEntries(
  catalog.groups.map(({ id }) => [id, catalog.symbols.filter(symbol => symbol.group === id)])
);

export function searchSymbols(query: string): CatalogSymbol[] {
  const term = query.trim().toLowerCase();
  if (!term) return [...catalog.symbols];
  return catalog.symbols
    .map(symbol => {
      const name = symbol.name.toLowerCase();
      const rank =
        symbol.char?.toLowerCase() === term
          ? 0
          : name.startsWith(term)
            ? 1
            : symbol.keywords.some(keyword => keyword.startsWith(term))
              ? 2
              : name.includes(term) || symbol.keywords.some(keyword => keyword.includes(term))
                ? 3
                : 4;
      return { symbol, rank };
    })
    .filter(({ rank }) => rank < 4)
    .sort((a, b) => a.rank - b.rank)
    .map(({ symbol }) => symbol);
}

export function symbolLabel(
  id: string,
  { requestDescription }: { requestDescription?: string } = {}
): string {
  const parsed = parseSymbolId(id);
  if (parsed?.kind === 'unicode') return parsed.text;
  if (parsed?.kind === 'custom') return getCatalogSymbol(id)?.name ?? 'Unknown symbol';
  if (parsed?.kind === 'request') return requestDescription?.trim() || 'Sent symbol';
  return 'Unknown symbol';
}

export const DEFAULT_SETUP_SYMBOLS = Array.from(
  '1234567890abcdefghijklmnopqrstuvwxyz',
  unicodeSymbolId
);

// Display only: asks for text presentation so emoji-capable symbols do not
// render as color emoji. Never store the result in an ID or copy text.
export function symbolDisplayText(text: string): string {
  return text.replace(/(?!\p{ASCII})(\p{Emoji})(?![\uFE0E\uFE0F])/gu, '$1\uFE0E');
}
