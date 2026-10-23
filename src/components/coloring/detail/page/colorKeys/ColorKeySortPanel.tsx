import { move } from '@dnd-kit/helpers';
import { DragDropProvider } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useMobileDevice } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import type { ColorKey, SymbolRequestPreview } from '@/services/pocketbase/colorKeys.service';
import { SymbolGlyph } from './SymbolGlyph';
import { colorKeyLabel, requestFor } from './symbolName';

/** "Sort Color Order": a side panel on wide screens, a bottom sheet on phones. */
export function ColorKeySortPanel({
  order,
  onOrderChange,
  onDone,
  onCloseAutoFocus,
  requests,
}: {
  /** Null while closed. */
  order: ColorKey[] | null;
  onOrderChange: (order: ColorKey[]) => void;
  /** Done, Escape, the close button and swiping down all finish the sort. */
  onDone: () => void;
  onCloseAutoFocus?: (event: Event) => void;
  requests?: Record<string, SymbolRequestPreview>;
}) {
  const { isPhone } = useMobileDevice();
  const open = order !== null;
  const changeOpen = (next: boolean) => !next && onDone();
  const TitleEl = isPhone ? DrawerTitle : SheetTitle;
  const body = (
    <>
      <header
        className={cn(
          'border-border flex shrink-0 items-center gap-3 border-b px-4 pb-3',
          isPhone ? 'pt-3' : 'pt-4 pr-14'
        )}
      >
        <TitleEl className="flex-1 text-lg font-semibold">Sort Color Order</TitleEl>
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {order ? (
          <DragDropProvider onDragEnd={event => onOrderChange(move(order, event))}>
            <ul className="divide-border/60 divide-y">
              {order.map((row, index) => (
                <SortRow key={row.id} row={row} index={index} requests={requests} />
              ))}
            </ul>
          </DragDropProvider>
        ) : null}
      </div>
    </>
  );

  if (isPhone) {
    return (
      <Drawer open={open} onOpenChange={changeOpen} shouldScaleBackground={false}>
        <DrawerContent
          className="max-h-[92dvh]"
          aria-describedby={undefined}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          {body}
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetContent
        side="right"
        className="flex flex-col gap-0 p-0"
        aria-describedby={undefined}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {body}
      </SheetContent>
    </Sheet>
  );
}

function SortRow({
  row,
  index,
  requests,
}: {
  row: ColorKey;
  index: number;
  requests?: Record<string, SymbolRequestPreview>;
}) {
  const { ref, handleRef, isDragging } = useSortable({ id: row.id, index });
  const request = requestFor(row.symbol, requests);
  const code = row.code.trim();
  return (
    <li
      ref={ref}
      className={cn(
        'bg-background flex min-h-14 items-center gap-3 px-2 py-1.5',
        isDragging && 'shadow-lg'
      )}
    >
      <span aria-hidden="true" className="flex w-10 shrink-0 justify-center text-3xl">
        <SymbolGlyph symbol={row.symbol} request={request} />
      </span>
      <span aria-hidden="true" className="min-w-0 flex-1">
        <span className={cn('block truncate font-mono text-sm', !code && 'text-muted-foreground')}>
          {code || 'No code yet'}
        </span>
        {row.color_name ? (
          <span className="text-muted-foreground block truncate text-sm">{row.color_name}</span>
        ) : null}
      </span>
      {/* Only the handle drags, and dnd-kit's default touch hold keeps a swipe scrolling on iOS
          Safari. Stopping pointerdown keeps vaul from taking pointer capture away from dnd-kit. */}
      <button
        ref={handleRef}
        type="button"
        onPointerDown={event => event.stopPropagation()}
        aria-label={colorKeyLabel(row, request)}
        className="text-muted-foreground hover:bg-muted flex size-11 shrink-0 cursor-grab items-center justify-center rounded-md select-none [-webkit-touch-callout:none]"
      >
        <GripVertical aria-hidden="true" className="size-5" />
      </button>
    </li>
  );
}
