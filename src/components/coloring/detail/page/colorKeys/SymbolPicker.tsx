import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Camera } from 'lucide-react';
import { Input } from '@/components/ui/input';
import catalog from '@/features/coloring/colorKeys/symbolCatalog.json';
import {
  searchSymbols,
  symbolsByGroup,
  type SymbolGroupId,
} from '@/features/coloring/colorKeys/symbols';
import { cn } from '@/lib/utils';
import { ColorKeySheet } from './ColorKeySheet';
import { SymbolGlyph } from './SymbolGlyph';
import { readRecentSymbols, rememberRecentSymbol } from './recentSymbols';
import { symbolName } from './symbolName';

const COLUMNS = 6;

type Section = { id: string; label: string; symbols: string[] };

export interface SymbolPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (symbol: string) => void;
  userId: string;
  title?: string;
  /** Opens the symbol request flow. The "Can't find your symbol?" row is hidden without it. */
  onRequestSymbol?: () => void;
}

export function SymbolPicker({
  open,
  onOpenChange,
  title = 'Add a symbol',
  ...props
}: SymbolPickerProps) {
  return (
    <ColorKeySheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Search or browse the symbol catalog."
      fill
    >
      {open && <PickerBody {...props} />}
    </ColorKeySheet>
  );
}

function targetIndex(
  key: string,
  active: number,
  sections: Section[],
  starts: number[],
  total: number
) {
  if (key === 'Home') return 0;
  if (key === 'End') return total - 1;
  if (key === 'ArrowRight') return Math.min(active + 1, total - 1);
  if (key === 'ArrowLeft') return Math.max(active - 1, 0);
  const section = starts.findLastIndex(start => start <= active);
  const index = active - starts[section];
  const length = sections[section].symbols.length;
  const column = index % COLUMNS;
  if (key === 'ArrowDown') {
    if (Math.floor(index / COLUMNS) < Math.floor((length - 1) / COLUMNS))
      return starts[section] + Math.min(index + COLUMNS, length - 1);
    const next = sections[section + 1];
    return next ? starts[section + 1] + Math.min(column, next.symbols.length - 1) : active;
  }
  if (key === 'ArrowUp') {
    if (index >= COLUMNS) return active - COLUMNS;
    const previous = sections[section - 1];
    if (!previous) return active;
    const lastRow = Math.floor((previous.symbols.length - 1) / COLUMNS) * COLUMNS;
    return starts[section - 1] + Math.min(lastRow + column, previous.symbols.length - 1);
  }
  return null;
}

const SymbolOption = memo(function SymbolOption({
  symbol,
  id,
  index,
  isActive,
  onSelect,
}: {
  symbol: string;
  id: string;
  index: number;
  isActive: boolean;
  onSelect: (index: number, symbol: string) => void;
}) {
  const name = symbolName(symbol);
  return (
    // Keyboard selection lives on the listbox via aria-activedescendant.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      tabIndex={-1}
      onMouseDown={event => event.preventDefault()}
      id={id}
      role="option"
      aria-selected={isActive}
      aria-label={name}
      title={name}
      data-symbol={symbol}
      onClick={() => onSelect(index, symbol)}
      className={cn(
        'border-border/70 bg-background/60 hover:bg-muted flex h-12 cursor-pointer items-center justify-center rounded-md border text-2xl select-none',
        isActive &&
          'group-focus-visible:border-primary group-focus-visible:ring-primary/40 group-focus-visible:ring-2'
      )}
    >
      <span aria-hidden="true" className="contents">
        <SymbolGlyph symbol={symbol} />
      </span>
    </div>
  );
});

function PickerBody({
  onPick,
  userId,
  onRequestSymbol,
}: Omit<SymbolPickerProps, 'open' | 'onOpenChange' | 'title'>) {
  const idPrefix = useId();
  const listboxRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const recent = useMemo(() => readRecentSymbols(userId), [userId]);
  const sections = useMemo<Section[]>(() => {
    if (query.trim())
      return [{ id: 'results', label: 'Results', symbols: searchSymbols(query).map(s => s.id) }];
    return [
      ...(recent.length ? [{ id: 'recent', label: 'Recently used', symbols: recent }] : []),
      ...catalog.groups.map(group => ({
        id: group.id,
        label: group.label,
        symbols: symbolsByGroup[group.id as SymbolGroupId].map(symbol => symbol.id),
      })),
    ];
  }, [query, recent]);
  const starts = sections.reduce<number[]>(
    (all, _, index) => [...all, index ? all[index - 1] + sections[index - 1].symbols.length : 0],
    []
  );
  const total = sections.reduce((sum, section) => sum + section.symbols.length, 0);
  const optionId = (index: number) => `${idPrefix}-option-${index}`;
  const activeIndex = Math.min(active, Math.max(total - 1, 0));

  useEffect(() => {
    document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- optionId is derived from the stable idPrefix
  }, [activeIndex]);

  const pick = useCallback(
    (symbol: string) => {
      rememberRecentSymbol(userId, symbol);
      onPick(symbol);
    },
    [userId, onPick]
  );
  const onSelect = useCallback(
    (index: number, symbol: string) => {
      setActive(index);
      pick(symbol);
    },
    [pick]
  );
  const symbolAt = (index: number) => {
    const section = starts.findLastIndex(start => start <= index);
    return sections[section]?.symbols[index - starts[section]];
  };
  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!total) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const symbol = symbolAt(activeIndex);
      if (symbol) pick(symbol);
      return;
    }
    const next = targetIndex(event.key, activeIndex, sections, starts, total);
    if (next === null) return;
    event.preventDefault();
    setActive(next);
  };

  return (
    <div className="space-y-4">
      <Input
        type="search"
        aria-label="Search symbols"
        aria-controls={`${idPrefix}-listbox`}
        placeholder="Search: psi, yen, triangle, circles"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="search"
        className="h-11"
        value={query}
        onChange={event => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={event => {
          if (event.key !== 'ArrowDown' || !total) return;
          event.preventDefault();
          listboxRef.current?.focus();
        }}
      />
      <p role="status" className="sr-only">
        {total ? `${total} symbol${total === 1 ? '' : 's'}` : 'No symbols match.'}
      </p>
      {total === 0 ? (
        <p aria-hidden="true" className="text-muted-foreground text-sm">
          No symbols match.
        </p>
      ) : null}
      <div
        ref={listboxRef}
        id={`${idPrefix}-listbox`}
        role="listbox"
        aria-label="Symbols"
        tabIndex={0}
        aria-activedescendant={total ? optionId(activeIndex) : undefined}
        data-columns={COLUMNS}
        onKeyDown={onListKeyDown}
        className="group focus-visible:ring-ring/50 space-y-4 rounded-md outline-none focus-visible:ring-[3px]"
      >
        {sections.map((section, sectionIndex) => (
          <div key={section.id} role="group" aria-label={section.label} className="space-y-2">
            <div
              aria-hidden="true"
              className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
            >
              {section.label}
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {section.symbols.map((symbol, index) => {
                const flatIndex = starts[sectionIndex] + index;
                return (
                  <SymbolOption
                    key={symbol}
                    symbol={symbol}
                    id={optionId(flatIndex)}
                    index={flatIndex}
                    isActive={flatIndex === activeIndex}
                    onSelect={onSelect}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {onRequestSymbol ? (
        <button
          type="button"
          onClick={onRequestSymbol}
          className="border-border/70 hover:bg-muted flex min-h-11 w-full items-center gap-3 rounded-md border border-dashed p-3 text-left"
        >
          <Camera aria-hidden="true" className="text-primary size-6 shrink-0" />
          <span>
            <span className="block font-semibold">Can't find your symbol?</span>
            <span className="text-muted-foreground block text-sm">
              Send us a photo and we'll add it.
            </span>
          </span>
        </button>
      ) : null}
    </div>
  );
}
