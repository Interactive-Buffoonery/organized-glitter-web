import {
  getCatalogSymbol,
  symbolDisplayText,
  symbolLabel,
} from '@/features/coloring/colorKeys/symbols';
import type { ColorKey, SymbolRequestPreview } from '@/services/pocketbase/colorKeys.service';

/** Human name for a symbol: catalog name when known, otherwise its label. */
export const symbolName = (symbol: string, request?: SymbolRequestPreview) =>
  getCatalogSymbol(symbol)?.name ??
  symbolLabel(symbol, { requestDescription: request?.description });

/** Visible name: like symbolName, but raw Unicode asks for text presentation. Not for aria-labels. */
export const symbolDisplayName = (symbol: string, request?: SymbolRequestPreview) =>
  symbol.startsWith('u:') && !getCatalogSymbol(symbol)
    ? symbolDisplayText(symbolName(symbol))
    : symbolName(symbol, request);

/** A stored swatch, only when it is a plain #RRGGBB color that is safe to put in a style. */
export const safeSwatch = (swatch: string) => (/^#[0-9a-f]{6}$/i.test(swatch) ? swatch : undefined);

export const requestFor = (symbol: string, requests: Record<string, SymbolRequestPreview> = {}) =>
  symbol.startsWith('r:') ? requests[symbol.slice(2)] : undefined;

export const colorKeyLabel = (row: ColorKey, request?: SymbolRequestPreview) =>
  [symbolName(row.symbol, request), row.code.trim() || 'no code yet', row.color_name]
    .filter(Boolean)
    .join(', ');

/** Plain text for Copy: one `<symbol> <code>` line per row, in strip order. */
export function colorKeyCopyText(
  rows: ColorKey[],
  requests: Record<string, SymbolRequestPreview> = {}
) {
  return rows
    .map(row => {
      const symbol = symbolLabel(row.symbol, {
        requestDescription: requestFor(row.symbol, requests)?.description,
      }).replace(/[︎️]/gu, '');
      return `${symbol} ${row.code}`.replace(/\s+/g, ' ').trim();
    })
    .join('\n');
}
