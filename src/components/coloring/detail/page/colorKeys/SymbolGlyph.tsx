import { useState } from 'react';
import { PrivateFileImage } from '@/components/image/PrivateFileImage';
import {
  getCatalogSymbol,
  parseSymbolId,
  symbolDisplayText,
  symbolLabel,
} from '@/features/coloring/colorKeys/symbols';
import { cn } from '@/lib/utils';
import type { SymbolRequestPreview } from '@/services/pocketbase/colorKeys.service';

/** Renders a stored symbol ID. Size it with font-size; shapes and photos scale to 1em. */
export function SymbolGlyph({
  symbol,
  request,
  className,
}: {
  symbol: string;
  request?: SymbolRequestPreview;
  className?: string;
}) {
  const [failedThumbnail, setFailedThumbnail] = useState('');
  const parsed = parseSymbolId(symbol);
  const label = symbolLabel(symbol, { requestDescription: request?.description });
  const frame = cn('inline-flex size-[1em] shrink-0 items-center justify-center', className);

  if (parsed?.kind === 'unicode') {
    return (
      <span role="img" aria-label={label} className={cn(frame, 'w-auto min-w-[1em] leading-none')}>
        <span aria-hidden="true">{symbolDisplayText(parsed.text)}</span>
      </span>
    );
  }
  const path = parsed?.kind === 'custom' ? getCatalogSymbol(symbol)?.path : undefined;
  if (path) {
    return (
      <svg
        role="img"
        aria-label={label}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={frame}
      >
        <path d={path} />
      </svg>
    );
  }
  const thumbnail = parsed?.kind === 'request' ? request?.thumbnail : undefined;
  if (thumbnail && thumbnail !== failedThumbnail) {
    return (
      <PrivateFileImage
        src={thumbnail}
        alt={label}
        loading="lazy"
        decoding="async"
        className={cn(frame, 'rounded-sm object-contain')}
        onError={() => setFailedThumbnail(thumbnail)}
      />
    );
  }
  return (
    <span role="img" aria-label={label} className={frame}>
      <span className="border-muted-foreground/60 size-[0.8em] rounded-sm border-2 border-dashed" />
    </span>
  );
}
