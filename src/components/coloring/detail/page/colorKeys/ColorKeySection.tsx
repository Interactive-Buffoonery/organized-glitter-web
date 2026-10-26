import { Suspense, lazy, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { ArrowUpDown } from 'lucide-react';
import { ClientResponseError } from 'pocketbase';
import { Section, SectionHeading } from '@/components/shared/Section';
import { Button } from '@/components/ui/button';
import { DEFAULT_SETUP_SYMBOLS } from '@/features/coloring/colorKeys/symbols';
import { useColorKeys, useSymbolRequests } from '@/hooks/queries/coloring/useColorKeys';
import {
  useCreateColorKey,
  useReorderColorKeys,
  useSetupColorKeys,
} from '@/hooks/mutations/coloring/useColorKeyMutations';
import { useAuth } from '@/hooks/useAuth';
import { notifyError, notifySuccess } from '@/lib/notifications';
import type { ColorKey } from '@/services/pocketbase/colorKeys.service';
import { createLogger } from '@/utils/logger';
import { ColorKeyEntry, type EntrySymbolRequest, type EntryTarget } from './ColorKeyEntry';
import { ColorKeyRowContent } from './ColorKeyRowContent';
import { ColorKeySetup } from './ColorKeySetup';
import { copyColorKeys } from './copyColorKeys';
import { loadSortPanel } from './loadSortPanel';
import { PinnedStrip } from './PinnedStrip';
import { SymbolPicker } from './SymbolPicker';
import { SymbolRequestDialog } from './SymbolRequestDialog';
import { colorKeyLabel, requestFor } from './symbolName';

const logger = createLogger('ColorKeySection');

/** Where a sent photo's `r:` symbol goes when it stands in on this page. */
type RequestTarget =
  { kind: 'add' } | { kind: 'setup' } | { kind: 'entry'; request: EntrySymbolRequest };
const THANKS = "Thanks for the photo. We'll email you when it's added.";
const SORT_FAILED = 'Couldn’t save the updated order. Please try again.';
const SORT_OFFLINE = 'Sorting colors needs a connection. Reconnect and try again.';
const SORT_LOAD_FAILED = 'Couldn’t open Sort Color Order. Please try again.';

// dnd-kit stays off the coloring page's first load; the panel loads when Sort is first used.
const ColorKeySortPanel = lazy(() =>
  loadSortPanel().then(module => ({ default: module.ColorKeySortPanel }))
);

const subscribeOnline = (onChange: () => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};
const useOnline = () =>
  useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  );

export function ColorKeySection({
  pageId,
  bookLabel = '',
}: {
  pageId: string;
  /** Prefills "Book and page" in a symbol request. */
  bookLabel?: string;
}) {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <ColorKeyEditor
      key={`${user.id}:${pageId}`}
      pageId={pageId}
      userId={user.id}
      email={user.email ?? ''}
      bookLabel={bookLabel}
    />
  );
}

function ColorKeyEditor({
  pageId,
  userId,
  email,
  bookLabel,
}: {
  pageId: string;
  userId: string;
  email: string;
  bookLabel: string;
}) {
  const query = useColorKeys(pageId, userId);
  const rows = query.data ?? [];
  const [sentIds, setSentIds] = useState<string[]>([]);
  const requests = useSymbolRequests(userId, [
    ...rows.map(row => row.symbol),
    ...sentIds.map(id => `r:${id}`),
  ]).data;
  const setup = useSetupColorKeys(pageId, userId);
  const createKey = useCreateColorKey(pageId, userId);
  const reorder = useReorderColorKeys(pageId, userId);
  const online = useOnline();
  // The panel's working order; null while it is closed.
  const [sortOrder, setSortOrder] = useState<ColorKey[] | null>(null);
  const [sortError, setSortError] = useState('');
  // Stays mounted once loaded so closing can animate and return focus.
  const [sortPanelLoaded, setSortPanelLoaded] = useState(false);
  const sorting = sortOrder !== null || reorder.isPending;
  // Kept after closing so focus can return to where the request started.
  const [requestTarget, setRequestTarget] = useState<RequestTarget | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  // A send can outlast several renders; place after whatever rows exist when it lands.
  const latestRows = useRef(rows);
  useEffect(() => {
    latestRows.current = rows;
  });
  const [skipped, setSkipped] = useState(false);
  // Outlives the open form so the next color starts on the same strip photo.
  const [stripPhoto, setStripPhoto] = useState(0);
  const [setupSymbols, setSetupSymbols] = useState<string[]>(DEFAULT_SETUP_SYMBOLS);
  const [off, setOff] = useState<Set<string>>(() => new Set());
  const [picker, setPicker] = useState<'setup' | 'add' | null>(null);
  const [entry, setEntry] = useState<EntryTarget | null>(null);
  const saveOpenEntry = useRef<(() => Promise<boolean>) | null>(null);
  // Moving to another row saves the open one first, so a draft is never dropped silently.
  // Only the latest tap, Cancel, Save, Save and next or Delete decides what opens after a slow save.
  const entryRequest = useRef(0);
  const goTo = async (target: EntryTarget | null, work = saveOpenEntry.current) => {
    const request = ++entryRequest.current;
    let saved = saveOpenEntry.current;
    if (work && !(await work())) return;
    // Another device can replace the open form mid-save; each replacement is saved before leaving.
    while (request === entryRequest.current && saveOpenEntry.current !== saved) {
      saved = saveOpenEntry.current;
      if (saved && !(await saved())) return;
    }
    if (request !== entryRequest.current) return;
    if (target) setEntry(target);
    else closeEntry();
  };
  const rowTarget = (row: ColorKey): EntryTarget => ({
    row,
    symbol: row.symbol,
    position: row.position,
  });

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
  const next =
    editingIndex >= 0
      ? rows[editingIndex + 1]
      : entry?.row
        ? rows.find(row => row.position > entry.position)
        : undefined;
  const filled = rows.filter(row => row.code.trim()).length;
  const showSetup = !query.isPending && !query.isError && rows.length === 0 && !skipped && !entry;

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
  const nextPositionIn = (list: typeof rows) =>
    list.reduce((max, row) => Math.max(max, row.position + 1), 0);
  const nextPosition = nextPositionIn(rows);
  const toggleSetupSymbol = (symbol: string) =>
    setOff(current => {
      const nextOff = new Set(current);
      if (nextOff.has(symbol)) nextOff.delete(symbol);
      else nextOff.add(symbol);
      return nextOff;
    });
  const addSetupSymbol = (symbol: string) => {
    setSetupSymbols(symbols => (symbols.includes(symbol) ? symbols : [...symbols, symbol]));
    setOff(current => {
      const nextOff = new Set(current);
      nextOff.delete(symbol);
      return nextOff;
    });
  };
  const addRequestRow = async (symbol: string) => {
    try {
      const position = nextPositionIn(latestRows.current);
      const row = await createKey.mutateAsync({ symbol, position });
      void goTo(rowTarget(row));
      return true;
    } catch (error) {
      logger.warn('Could not add a sent symbol to the page', error);
      return false;
    }
  };
  const openRequest = (target: RequestTarget) => {
    setRequestTarget(target);
    setRequestOpen(true);
  };
  const onPick = (symbol: string) => {
    setPicker(null);
    if (picker === 'setup') addSetupSymbol(symbol);
    else void goTo({ symbol, position: nextPosition });
  };
  /** False when adding the row failed; the sheet then offers to add it again. */
  const onSent = async (requestId: string, usePhoto: boolean) => {
    const symbol = `r:${requestId}`;
    setSentIds(ids => (ids.includes(requestId) ? ids : [...ids, requestId]));
    let unused = false;
    if (usePhoto && requestTarget?.kind === 'setup') addSetupSymbol(symbol);
    if (usePhoto && requestTarget?.kind === 'add' && !(await addRequestRow(symbol))) return false;
    if (usePhoto && requestTarget?.kind === 'entry') unused = !requestTarget.request.place(symbol);
    setRequestOpen(false);
    if (unused) notifySuccess(THANKS, "It wasn't used on this color because the color changed.");
    else notifySuccess(THANKS);
    return true;
  };
  const finishSort = async () => {
    const ordered = sortOrder;
    setSortOrder(null);
    if (!ordered || ordered.every((row, index) => row.id === rows[index]?.id)) return;
    setSortError('');
    // A row that arrived or left while the panel was open would get a wrong position.
    const rowsById = new Map(rows.map(row => [row.id, row]));
    const current = ordered.flatMap(row => rowsById.get(row.id) ?? []);
    if (ordered.length !== rows.length || current.length !== ordered.length)
      return setSortError(SORT_FAILED);
    try {
      await reorder.mutateAsync(current);
    } catch (error) {
      logger.warn('Could not save the color order', error);
      setSortError(navigator.onLine ? SORT_FAILED : SORT_OFFLINE);
    }
  };
  const openSort = async () => {
    setSortError('');
    try {
      await loadSortPanel();
    } catch (error) {
      logger.warn('Could not load the sort panel', error);
      return setSortError(navigator.onLine ? SORT_LOAD_FAILED : SORT_OFFLINE);
    }
    setSortPanelLoaded(true);
    setSortOrder(rows);
  };
  const focusAfterRequest = (event: Event) => {
    event.preventDefault();
    if (requestTarget?.kind === 'entry') return requestTarget.request.focus();
    // A placed row opens its own entry, which already holds focus.
    if (entry) return;
    const returnTo = requestTarget?.kind === 'setup' ? 'add-setup-symbol' : 'add-symbol';
    document.getElementById(`color-keys-${pageId}-${returnTo}`)?.focus();
  };

  // A row that vanished mid-edit stays listed under its key, so the draft survives.
  const listed = entry?.row && editingIndex < 0 ? [...rows, entry.row] : rows;
  const rowButtonId = (id: string) => `color-keys-${pageId}-row-${id}`;
  const closeEntry = () => {
    const id = entry?.row?.id;
    entryRequest.current++;
    flushSync(() => setEntry(null));
    (
      (id && document.getElementById(rowButtonId(id))) ||
      document.getElementById(`color-keys-${pageId}-add-symbol`) ||
      document.getElementById(`color-keys-${pageId}`)
    )?.focus();
  };
  const entryForm = liveEntry ? (
    <ColorKeyEntry
      pageId={pageId}
      userId={userId}
      target={liveEntry}
      positionForNew={nextPosition}
      next={next}
      requests={requests}
      onClose={closeEntry}
      onLeave={(then, work) => void goTo(then === 'next' && next ? rowTarget(next) : null, work)}
      saveRef={saveOpenEntry}
      onRequestSymbol={request => {
        // A send can finish after this form closed or was replaced; only place into the one that asked.
        const asked = saveOpenEntry.current;
        openRequest({
          kind: 'entry',
          request: {
            ...request,
            place: symbol => asked === saveOpenEntry.current && request.place(symbol),
          },
        });
      }}
    />
  ) : null;
  return (
    <Section variant="bordered" className="space-y-3" landmark={false}>
      <div className="flex items-center gap-3">
        <SectionHeading id={`color-keys-${pageId}`} tabIndex={-1} className="flex-1 outline-none">
          Color key
        </SectionHeading>
        {!showSetup && rows.length > 1 ? (
          <Button
            type="button"
            variant="link"
            className="px-0"
            disabled={!online || sorting || setup.isPending || createKey.isPending}
            onPointerEnter={() => void loadSortPanel().catch(() => {})}
            onClick={() => void openSort()}
          >
            <ArrowUpDown aria-hidden="true" />
            Sort
          </Button>
        ) : null}
      </div>
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
        <ColorKeySetup
          pageId={pageId}
          symbols={setupSymbols}
          off={off}
          requests={requests}
          saving={setup.isPending}
          onToggle={toggleSetupSymbol}
          onAddSymbol={() => setPicker('setup')}
          onStart={() => void startSetup()}
          onSkip={() => setSkipped(true)}
        />
      ) : null}

      {!showSetup && !query.isPending && !query.isError ? (
        <>
          {rows.length === 0 && !entry ? (
            <p className="text-muted-foreground text-sm">
              Record the color you used for each symbol on this page.
            </p>
          ) : (
            <>
              {entry ? (
                <PinnedStrip
                  pageId={pageId}
                  userId={userId}
                  photo={stripPhoto}
                  onPhotoChange={setStripPhoto}
                />
              ) : null}
              <ul className="divide-border/60 -mx-2 divide-y">
                {listed.map(row => {
                  const request = requestFor(row.symbol, requests);
                  return row.id === entry?.row?.id ? (
                    <li key={row.id}>{entryForm}</li>
                  ) : (
                    <li key={row.id}>
                      <button
                        id={rowButtonId(row.id)}
                        type="button"
                        aria-label={colorKeyLabel(row, request)}
                        disabled={sorting}
                        onClick={() => void goTo(rowTarget(row))}
                        className="hover:bg-muted/60 flex min-h-14 w-full items-center gap-3 rounded-md px-2 py-1.5 text-left disabled:opacity-60"
                      >
                        <ColorKeyRowContent row={row} request={request} />
                      </button>
                    </li>
                  );
                })}
                {entry && !entry.row ? <li key="new">{entryForm}</li> : null}
              </ul>
            </>
          )}
          {sortError ? (
            <p role="alert" className="text-destructive text-sm">
              {sortError}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button
              id={`color-keys-${pageId}-add-symbol`}
              type="button"
              variant="link"
              className="px-0"
              disabled={sorting}
              onClick={() => setPicker('add')}
            >
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
                  onClick={() => void copyColorKeys(rows, requests)}
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
        onRequestSymbol={() => {
          openRequest({ kind: picker === 'setup' ? 'setup' : 'add' });
          setPicker(null);
        }}
      />
      <SymbolRequestDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        onCloseAutoFocus={focusAfterRequest}
        userId={userId}
        pageId={pageId}
        bookLabel={bookLabel}
        email={email}
        onSent={onSent}
      />
      {sortPanelLoaded ? (
        <Suspense fallback={null}>
          <ColorKeySortPanel
            order={sortOrder}
            onOrderChange={setSortOrder}
            onDone={() => void finishSort()}
            onCloseAutoFocus={event => {
              event.preventDefault();
              document.getElementById(`color-keys-${pageId}`)?.focus();
            }}
            requests={requests}
          />
        </Suspense>
      ) : null}
    </Section>
  );
}
