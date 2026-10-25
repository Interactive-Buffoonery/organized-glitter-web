import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SymbolRequestPreview } from '@/services/pocketbase/colorKeys.service';
import { SymbolGlyph } from './SymbolGlyph';
import { requestFor, symbolName } from './symbolName';

/** First-visit grid: every default symbol starts on; the user turns off what the strip lacks. */
export function ColorKeySetup({
  pageId,
  symbols,
  off,
  requests,
  saving,
  onToggle,
  onAddSymbol,
  onStart,
  onSkip,
}: {
  pageId: string;
  symbols: string[];
  off: ReadonlySet<string>;
  requests?: Record<string, SymbolRequestPreview>;
  saving: boolean;
  onToggle: (symbol: string) => void;
  onAddSymbol: () => void;
  onStart: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Turn off the symbols that aren't on this page's strip.
      </p>
      <div
        role="group"
        aria-label="Symbols on this page"
        className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5"
      >
        {symbols.map(symbol => {
          const isOn = !off.has(symbol);
          const request = requestFor(symbol, requests);
          return (
            <button
              key={symbol}
              type="button"
              aria-pressed={isOn}
              aria-label={symbolName(symbol, request)}
              disabled={saving}
              onClick={() => onToggle(symbol)}
              className={cn(
                'flex size-11 items-center justify-center rounded-md border text-lg transition-colors',
                isOn
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-muted-foreground text-muted-foreground line-through'
              )}
            >
              <span aria-hidden="true" className="contents">
                <SymbolGlyph symbol={symbol} request={request} />
              </span>
            </button>
          );
        })}
        <button
          id={`color-keys-${pageId}-add-setup-symbol`}
          type="button"
          aria-label="Add symbols after z"
          disabled={saving}
          onClick={onAddSymbol}
          className="border-border text-muted-foreground hover:bg-muted flex size-11 items-center justify-center rounded-md border border-dashed"
        >
          <Plus aria-hidden="true" className="size-5" />
        </button>
      </div>
      <p className="text-muted-foreground text-sm">Use + to add symbols after z.</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={saving || symbols.every(symbol => off.has(symbol))}
          onClick={onStart}
        >
          {saving ? 'Saving…' : 'Start'}
        </Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={onSkip}>
          Skip
        </Button>
      </div>
    </div>
  );
}
