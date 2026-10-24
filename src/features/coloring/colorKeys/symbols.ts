import catalog from './symbolCatalog.json';
import { parseSymbolId, unicodeSymbolId } from './symbolId';

export * from './symbolId';

export const SYMBOL_GROUP_IDS = [
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
] as const;

export type SymbolGroupId = (typeof SYMBOL_GROUP_IDS)[number];
export type CatalogSymbol = (typeof catalog.symbols)[number];
const symbolsById = new Map(catalog.symbols.map(symbol => [symbol.id, symbol]));

export function getCatalogSymbol(id: string): CatalogSymbol | undefined {
  return symbolsById.get(id);
}

export const symbolsByGroup = Object.fromEntries(
  SYMBOL_GROUP_IDS.map(id => [id, [] as CatalogSymbol[]])
) as Record<SymbolGroupId, CatalogSymbol[]>;
for (const symbol of catalog.symbols) symbolsByGroup[symbol.group as SymbolGroupId]?.push(symbol);

// Keywords are stored lowercase (enforced by the catalog test).
const searchIndex = catalog.symbols.map(symbol => ({
  symbol,
  char: symbol.char?.toLowerCase(),
  name: symbol.name.toLowerCase(),
}));

export function searchSymbols(query: string): CatalogSymbol[] {
  const term = query.trim().toLowerCase();
  if (!term) return [...catalog.symbols];
  return searchIndex
    .map(({ symbol, char, name }) => {
      const rank =
        char === term
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
