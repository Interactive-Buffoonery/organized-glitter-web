import { cn } from '@/lib/utils';
import type { ColorKey, SymbolRequestPreview } from '@/services/pocketbase/colorKeys.service';
import { SymbolGlyph } from './SymbolGlyph';
import { safeSwatch } from './symbolName';

/** Visual parts of a color key row; the caller's flex container supplies the accessible name. */
export function ColorKeyRowContent({
  row,
  request,
  compact = false,
  showSwatch = true,
}: {
  row: Pick<ColorKey, 'symbol' | 'code' | 'color_name' | 'swatch'>;
  request?: SymbolRequestPreview;
  compact?: boolean;
  showSwatch?: boolean;
}) {
  const code = row.code.trim();
  const name = row.color_name.trim();
  const swatch = showSwatch ? safeSwatch(row.swatch) : undefined;
  return (
    <>
      <span
        aria-hidden="true"
        className={cn('flex shrink-0 justify-center', compact ? 'w-6 text-lg' : 'w-10 text-3xl')}
      >
        <SymbolGlyph symbol={row.symbol} request={request} />
      </span>
      {compact ? (
        <span
          aria-hidden="true"
          className={cn(
            'min-w-0 flex-1 truncate text-sm',
            code ? 'font-mono' : 'text-muted-foreground'
          )}
        >
          {code || name || 'No code yet'}
        </span>
      ) : (
        <span aria-hidden="true" className="min-w-0 flex-1">
          <span
            className={cn('block truncate font-mono text-sm', !code && 'text-muted-foreground')}
          >
            {code || 'No code yet'}
          </span>
          {name ? (
            <span className="text-muted-foreground block truncate text-sm">{name}</span>
          ) : null}
        </span>
      )}
      {swatch ? (
        <span
          aria-hidden="true"
          className={cn(
            'border-border shrink-0 rounded-full border',
            compact ? 'size-3.5' : 'size-6'
          )}
          style={{ background: swatch }}
        />
      ) : null}
    </>
  );
}
