import { getCatalogSymbol, symbolLabel } from '@/features/coloring/colorKeys/symbols';
import type { ColorKey, SymbolRequestPreview } from '@/services/pocketbase/colorKeys.service';

/** Human name for a symbol: catalog name when known, otherwise its label. */
export const symbolName = (symbol: string, request?: SymbolRequestPreview) =>
  getCatalogSymbol(symbol)?.name ??
  symbolLabel(symbol, { requestDescription: request?.description });

export const requestFor = (symbol: string, requests: Record<string, SymbolRequestPreview> = {}) =>
  symbol.startsWith('r:') ? requests[symbol.slice(2)] : undefined;

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
      return `${symbol} ${row.code.trim()}`.trim();
    })
    .join('\n');
}
