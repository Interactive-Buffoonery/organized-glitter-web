import { useState } from 'react';
import { Plus } from 'lucide-react';
import { ClientResponseError } from 'pocketbase';
import { Section, SectionHeading } from '@/components/shared/Section';
import { Button } from '@/components/ui/button';
import { DEFAULT_SETUP_SYMBOLS } from '@/features/coloring/colorKeys/symbols';
import { useColorKeys, useSymbolRequests } from '@/hooks/queries/coloring/useColorKeys';
import { useSetupColorKeys } from '@/hooks/mutations/coloring/useColorKeyMutations';
import { useAuth } from '@/hooks/useAuth';
import { notifyError, notifySuccess } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import { createLogger } from '@/utils/logger';
import { ColorKeyEntry, type EntryTarget } from './ColorKeyEntry';
import { SymbolGlyph } from './SymbolGlyph';
import { SymbolPicker } from './SymbolPicker';
import { colorKeyCopyText, colorKeyLabel, requestFor, safeSwatch, symbolName } from './symbolName';

const logger = createLogger('ColorKeySection');

export function ColorKeySection({
  pageId,
  onRequestSymbol,
}: {
  pageId: string;
  /** Opens the symbol request flow from the picker. Without it the picker hides that row. */
  onRequestSymbol?: () => void;
}) {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <ColorKeyEditor
      key={`${user.id}:${pageId}`}
      pageId={pageId}
      userId={user.id}
      onRequestSymbol={onRequestSymbol}
    />
  );
}

function ColorKeyEditor({
  pageId,
  userId,
  onRequestSymbol,
}: {
  pageId: string;
  userId: string;
  onRequestSymbol?: () => void;
}) {
  const query = useColorKeys(pageId, userId);
  const rows = query.data ?? [];
  const requests = useSymbolRequests(
    userId,
    rows.map(row => row.symbol)
  ).data;
  const setup = useSetupColorKeys(pageId, userId);
  const [skipped, setSkipped] = useState(false);
  const [setupSymbols, setSetupSymbols] = useState<string[]>(DEFAULT_SETUP_SYMBOLS);
  const [off, setOff] = useState<Set<string>>(() => new Set());
  const [picker, setPicker] = useState<'setup' | 'add' | null>(null);
  const [entry, setEntry] = useState<EntryTarget | null>(null);

  const editingIndex = entry?.row ? rows.findIndex(row => row.id === entry.row?.id) : -1;
  const liveEntry: EntryTarget | null =
    entry?.row && editingIndex >= 0
      ? {
          ...entry,
          row: rows[editingIndex],
          symbol: rows[editingIndex].symbol,
          position: rows[editingIndex].position,
        }
      : entry;
  const next = editingIndex >= 0 ? rows[editingIndex + 1] : undefined;
  const filled = rows.filter(row => row.code.trim()).length;
  const showSetup = !query.isPending && !query.isError && rows.length === 0 && !skipped;

  const startSetup = async () => {
    const symbols = setupSymbols.filter(symbol => !off.has(symbol));
    // The setup grid unmounts with focus inside it; land on the heading instead.
    const focusHeading = () => document.getElementById(`color-keys-${pageId}`)?.focus();
    try {
      await setup.mutateAsync(symbols);
      focusHeading();
    } catch (error) {
      // Another device set the page up first; its rows are the answer once they load.
      if (error instanceof ClientResponseError && error.status === 409) {
        const refreshed = await query.refetch();
        if (!refreshed.isError && refreshed.data?.length) return void focusHeading();
      }
      logger.warn('Could not set up color keys', error);
      notifyError('Could not save the symbols. Try again.');
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(colorKeyCopyText(rows, requests));
      notifySuccess('Copied the colors for this page.');
    } catch (error) {
      logger.warn('Could not copy color keys', error);
      notifyError('Could not copy. Try again.');
    }
  };
  const onPick = (symbol: string) => {
    setPicker(null);
    if (picker === 'setup') {
      setSetupSymbols(symbols => (symbols.includes(symbol) ? symbols : [...symbols, symbol]));
      setOff(current => {
        const nextOff = new Set(current);
        nextOff.delete(symbol);
        return nextOff;
      });
      return;
    }
    const position = rows.reduce((max, row) => Math.max(max, row.position + 1), 0);
    setEntry({ symbol, position });
  };

  return (
    <Section variant="bordered" className="space-y-3" landmark={false}>
      <SectionHeading id={`color-keys-${pageId}`} tabIndex={-1} className="outline-none">
        Colors used
      </SectionHeading>
      {query.isPending && <p role="status">Loading colors…</p>}
      {query.isError && (
        <div role="alert">
          Could not load the colors for this page.{' '}
          <Button type="button" variant="link" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {showSetup ? (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Turn off the symbols that aren't on this page's strip.
          </p>
          <div
            role="group"
            aria-label="Symbols on this page"
            className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5"
          >
            {setupSymbols.map(symbol => {
              const isOn = !off.has(symbol);
              return (
                <button
                  key={symbol}
                  type="button"
                  aria-pressed={isOn}
                  aria-label={symbolName(symbol)}
                  disabled={setup.isPending}
                  onClick={() =>
                    setOff(current => {
                      const nextOff = new Set(current);
                      if (isOn) nextOff.add(symbol);
                      else nextOff.delete(symbol);
                      return nextOff;
                    })
                  }
                  className={cn(
                    'flex size-11 items-center justify-center rounded-md border text-lg transition-colors',
                    isOn
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-muted-foreground text-muted-foreground line-through'
                  )}
                >
                  <span aria-hidden="true" className="contents">
                    <SymbolGlyph symbol={symbol} />
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              aria-label="Add symbols after z"
              disabled={setup.isPending}
              onClick={() => setPicker('setup')}
              className="border-border text-muted-foreground hover:bg-muted flex size-11 items-center justify-center rounded-md border border-dashed"
            >
              <Plus aria-hidden="true" className="size-5" />
            </button>
          </div>
          <p className="text-muted-foreground text-sm">Use + to add symbols after z.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={setup.isPending || setupSymbols.every(symbol => off.has(symbol))}
              onClick={() => void startSetup()}
            >
              {setup.isPending ? 'Saving…' : 'Start'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={setup.isPending}
              onClick={() => setSkipped(true)}
            >
              Skip
            </Button>
          </div>
        </div>
      ) : null}

      {!showSetup && !query.isPending && !query.isError ? (
        <>
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Record the color you used for each symbol on this page.
            </p>
          ) : (
            <ul className="divide-border/60 -mx-2 divide-y">
              {rows.map(row => {
                const request = requestFor(row.symbol, requests);
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      aria-label={colorKeyLabel(row, request)}
                      onClick={() => setEntry({ row, symbol: row.symbol, position: row.position })}
                      className="hover:bg-muted/60 flex min-h-14 w-full items-center gap-3 rounded-md px-2 py-1.5 text-left"
                    >
                      <span className="flex w-10 shrink-0 justify-center text-3xl">
                        <SymbolGlyph symbol={row.symbol} request={request} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'block truncate font-mono text-sm',
                            !row.code.trim() && 'text-muted-foreground'
                          )}
                        >
                          {row.code.trim() || 'No code yet'}
                        </span>
                        {row.color_name ? (
                          <span className="text-muted-foreground block truncate text-sm">
                            {row.color_name}
                          </span>
                        ) : null}
                      </span>
                      {safeSwatch(row.swatch) ? (
                        <span
                          aria-hidden="true"
                          className="border-border size-6 shrink-0 rounded-full border"
                          style={{ background: safeSwatch(row.swatch) }}
                        />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button type="button" variant="link" className="px-0" onClick={() => setPicker('add')}>
              Add symbol
            </Button>
            {rows.length === 0 ? (
              <Button
                type="button"
                variant="link"
                className="px-0"
                onClick={() => setSkipped(false)}
              >
                Set up symbols
              </Button>
            ) : (
              <>
                <span className="text-muted-foreground text-sm">
                  {filled} of {rows.length} filled in
                </span>
                <Button
                  type="button"
                  variant="link"
                  className="ml-auto px-0"
                  onClick={() => void copy()}
                >
                  Copy
                </Button>
              </>
            )}
          </div>
        </>
      ) : null}

      <SymbolPicker
        open={picker !== null}
        onOpenChange={open => !open && setPicker(null)}
        userId={userId}
        onPick={onPick}
        onRequestSymbol={onRequestSymbol}
      />
      <ColorKeyEntry
        pageId={pageId}
        userId={userId}
        target={liveEntry}
        next={next}
        requests={requests}
        onClose={() => setEntry(null)}
        onNext={row =>
          setEntry({ row, symbol: row.symbol, position: row.position, focusCode: true })
        }
        onRequestSymbol={onRequestSymbol}
      />
    </Section>
  );
}
