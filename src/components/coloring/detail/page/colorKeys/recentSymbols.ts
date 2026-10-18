import { isSymbolId } from '@/features/coloring/colorKeys/symbols';

const MAX_RECENT = 16;
const storageKey = (userId: string) => `organized-glitter:color-key-recent:${userId}`;

export function readRecentSymbols(userId: string): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(storageKey(userId)) ?? '[]');
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === 'string' && isSymbolId(id))
      : [];
  } catch {
    return [];
  }
}

export function rememberRecentSymbol(userId: string, symbol: string) {
  if (symbol.startsWith('r:')) return;
  const next = [symbol, ...readRecentSymbols(userId).filter(id => id !== symbol)];
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next.slice(0, MAX_RECENT)));
  } catch {
    // Storage can be full or blocked in private browsing; recents are a convenience.
  }
}
