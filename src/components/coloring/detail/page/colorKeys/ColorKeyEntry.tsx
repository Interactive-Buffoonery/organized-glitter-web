import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type MutableRefObject,
} from 'react';
import { flushSync } from 'react-dom';
import { X } from 'lucide-react';
import { ClientResponseError } from 'pocketbase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useColorKeyHistory } from '@/hooks/queries/coloring/useColorKeys';
import {
  useCreateColorKey,
  useDeleteColorKey,
  useUpdateColorKey,
} from '@/hooks/mutations/coloring/useColorKeyMutations';
import { useConfirmationDialog } from '@/hooks/useConfirmationDialog';
import { notifyError } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import { COLOR_KEY_LIMITS } from '@/schemas/colorKeySchema';
import type {
  ColorCodeHistoryEntry,
  ColorKey,
  SymbolRequestPreview,
} from '@/services/pocketbase/colorKeys.service';
import { createLogger } from '@/utils/logger';
import { SymbolGlyph } from './SymbolGlyph';
import { SymbolPicker } from './SymbolPicker';
import { requestFor, safeSwatch, symbolDisplayName } from './symbolName';

const logger = createLogger('ColorKeyEntry');
const MAX_SUGGESTIONS = 6;

export type EntryTarget = {
  row?: ColorKey;
  symbol: string;
  position: number;
};

interface ColorKeyEntryProps {
  pageId: string;
  userId: string;
  target: EntryTarget;
  positionForNew: number;
  next?: ColorKey;
  requests?: Record<string, SymbolRequestPreview>;
  onClose: () => void;
  onNext: (next: ColorKey) => void;
  /** Saves the open draft before another row opens; false keeps it open with the error. */
  saveRef: MutableRefObject<(() => Promise<boolean>) | null>;
  /** Opens the symbol request flow for this color. */
  onRequestSymbol?: (request: EntrySymbolRequest) => void;
}

export type EntrySymbolRequest = {
  /** Puts the sent photo's symbol in this color's draft; false once this form has closed. */
  place: (symbol: string) => boolean;
  /** Moves focus back to Change symbol after the request sheet closes. */
  focus: () => void;
};

const GONE = 'This color is no longer on this page. Save again to add it back.';
const HEX = /^#?([0-9a-f]{6})$/i;
const tidyHex = (value: string) => {
  const match = HEX.exec(value.trim());
  return match ? `#${match[1].toUpperCase()}` : value;
};

export function ColorKeyEntry({ target, ...props }: ColorKeyEntryProps) {
  const formKey = `${target.row?.id ?? 'new'}:${target.symbol}`;
  const [changed, setChanged] = useState<{ formKey: string; symbol: string } | null>(null);
  const [goneKey, setGoneKey] = useState('');
  const gone = goneKey === formKey;
  const symbol = changed?.formKey === formKey ? changed.symbol : target.symbol;
  // A request resolves after a send; it may only touch the form that asked for it.
  const openKey = useRef(formKey);
  useEffect(() => {
    openKey.current = formKey;
    return () => {
      openKey.current = '';
    };
  }, [formKey]);
  const { onRequestSymbol, ...formProps } = props;
  const rowKey = target.row?.id ?? 'new';
  const name = symbolDisplayName(symbol, requestFor(symbol, props.requests));
  return (
    <EntryForm
      key={formKey}
      label={target.row && !gone ? `Edit color: ${name}` : `Add a color: ${name}`}
      target={target}
      symbol={symbol}
      onSymbolChange={picked => setChanged({ formKey, symbol: picked })}
      gone={gone}
      onGone={() => setGoneKey(formKey)}
      // A save can finish after this form was replaced. It may still move on when its own
      // saved symbol caused the replacement, but not after Cancel, a row switch or another device.
      isCurrent={saved =>
        openKey.current === formKey ||
        (saved !== undefined && openKey.current === `${rowKey}:${saved}`)
      }
      onRequestSymbol={
        onRequestSymbol &&
        (focus =>
          onRequestSymbol({
            focus,
            place: picked => {
              if (openKey.current !== formKey) return false;
              setChanged({ formKey, symbol: picked });
              return true;
            },
          }))
      }
      {...formProps}
    />
  );
}

function EntryForm({
  pageId,
  userId,
  target,
  positionForNew,
  next,
  requests,
  onClose,
  onNext,
  onRequestSymbol,
  symbol,
  onSymbolChange,
  gone,
  onGone,
  label,
  isCurrent,
  saveRef,
}: Omit<ColorKeyEntryProps, 'onRequestSymbol'> & {
  onRequestSymbol?: (focusChangeSymbol: () => void) => void;
  label: string;
  isCurrent: (savedSymbol?: string) => boolean;
  target: EntryTarget;
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  /** The row was deleted, or is no longer ours to edit; the next save adds it back. */
  gone: boolean;
  onGone: () => void;
}) {
  const id = useId();
  const { row } = target;
  const triedInput = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState(row?.code ?? '');
  const [colorName, setColorName] = useState(row?.color_name ?? '');
  const [swatch, setSwatch] = useState(row?.swatch ?? '');
  const [tried, setTried] = useState<string[]>(row?.tried ?? []);
  const [triedDraft, setTriedDraft] = useState('');
  const [note, setNote] = useState(row?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const history = useColorKeyHistory(userId, true);
  const create = useCreateColorKey(pageId, userId);
  const update = useUpdateColorKey(pageId, userId);
  const remove = useDeleteColorKey(pageId, userId);
  const { confirmAction, ConfirmationDialog } = useConfirmationDialog();
  const busy = create.isPending || update.isPending || remove.isPending;

  const term = code.trim().toLowerCase();
  const suggestions: ColorCodeHistoryEntry[] = term
    ? (history.data ?? [])
        .filter(entry => entry.code.toLowerCase().startsWith(term) && entry.code !== code)
        .slice(0, MAX_SUGGESTIONS)
    : [];
  const showSuggestions = suggestOpen && suggestions.length > 0;

  const applySuggestion = (entry: ColorCodeHistoryEntry) => {
    setCode(entry.code);
    setColorName(entry.color_name);
    setSwatch(entry.swatch);
    setSuggestOpen(false);
    setActiveSuggestion(-1);
  };
  const onCodeKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveSuggestion(index => (index + step + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter' && activeSuggestion >= 0) {
      event.preventDefault();
      applySuggestion(suggestions[activeSuggestion]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setSuggestOpen(false);
    }
  };
  const addTried = () => {
    const value = triedDraft.trim();
    if (!value || tried.length >= COLOR_KEY_LIMITS.tried) return;
    setTried(values => (values.includes(value) ? values : [...values, value]));
    setTriedDraft('');
  };

  const removeTried = (value: string, event: MouseEvent<HTMLButtonElement>) => {
    const nextButton = event.currentTarget
      .closest('li')
      ?.nextElementSibling?.querySelector<HTMLButtonElement>('button');
    flushSync(() => setTried(values => values.filter(item => item !== value)));
    (nextButton ?? triedInput.current)?.focus();
  };
  const tidySwatch = () => setSwatch(tidyHex);

  const draft = triedDraft.trim();
  const input = {
    symbol,
    position: target.position,
    code,
    color_name: colorName,
    swatch: tidyHex(swatch),
    tried:
      draft && !tried.includes(draft) && tried.length < COLOR_KEY_LIMITS.tried
        ? [...tried, draft]
        : tried,
    note,
  };
  const changed =
    !row ||
    input.symbol !== row.symbol ||
    input.code !== row.code ||
    input.color_name !== row.color_name ||
    input.swatch !== row.swatch ||
    input.note !== row.note ||
    input.tried.join('\n') !== (row.tried ?? []).join('\n');

  const saving = useRef<Promise<boolean> | null>(null);
  const latestDraft = useRef('');
  useEffect(() => {
    latestDraft.current = JSON.stringify(input);
  });

  /** True once the draft is stored; `stay` leaves the form for the caller to replace. */
  const save = (then: 'close' | 'next' | 'stay'): Promise<boolean> => {
    // A switch waits for the save already on its way and only moves on if it worked.
    if (saving.current) return then === 'stay' ? saving.current : Promise.resolve(false);
    if (remove.isPending) return Promise.resolve(false);
    if (then === 'stay' && !changed) return Promise.resolve(true);
    const run = store(then).finally(() => {
      saving.current = null;
    });
    saving.current = run;
    return run;
  };
  const store = async (then: 'close' | 'next' | 'stay') => {
    const submitted = JSON.stringify(input);
    setError(null);
    try {
      if (row && !gone) await update.mutateAsync({ id: row.id, input });
      else await create.mutateAsync({ ...input, position: positionForNew });
    } catch (saveError) {
      if (row && !gone && saveError instanceof ClientResponseError && saveError.status === 404) {
        onGone();
        setError(GONE);
        return false;
      }
      logger.warn('Could not save a color key', saveError);
      const message = saveError instanceof Error ? saveError.message : 'Could not save. Try again.';
      setError(message);
      notifyError(message);
      return false;
    }
    // Typing during the save is newer than what was stored; keep the form open for it.
    if (!isCurrent(symbol) || latestDraft.current !== submitted) return false;
    if (then === 'next' && next) onNext(next);
    else if (then === 'close') onClose();
    return true;
  };
  useEffect(() => {
    const saveBeforeSwitch = () => save('stay');
    saveRef.current = saveBeforeSwitch;
    return () => {
      if (saveRef.current === saveBeforeSwitch) saveRef.current = null;
    };
  });
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void save('close');
  };
  const onDelete = async () => {
    if (!row || busy) return;
    const confirmed = await confirmAction(
      'Delete this color?',
      'This removes the symbol and its color from this page.',
      true
    );
    if (!confirmed) return;
    try {
      await remove.mutateAsync(row.id);
      if (isCurrent()) onClose();
    } catch (deleteError) {
      logger.warn('Could not delete a color key', deleteError);
      notifyError('Could not delete this color. Try again.');
    }
  };

  const request = requestFor(symbol, requests);
  const hasSwatch = Boolean(safeSwatch(swatch));
  const listboxId = `${id}-codes`;
  const field = 'space-y-1.5';
  const hint = 'text-muted-foreground font-normal';

  return (
    // Escape closes the form the way it closes a dialog.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <form
      aria-label={label}
      onSubmit={onSubmit}
      onKeyDown={event => {
        // Escape inside a portaled picker or dialog still bubbles here through React.
        if (event.key !== 'Escape' || !event.currentTarget.contains(event.target as Node)) return;
        event.preventDefault();
        onClose();
      }}
      className="border-border/70 bg-muted/30 my-1 space-y-4 rounded-lg border p-3"
      noValidate
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="border-border/70 bg-background/60 flex size-16 shrink-0 items-center justify-center rounded-lg border text-4xl"
        >
          <SymbolGlyph symbol={symbol} request={request} />
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{symbolDisplayName(symbol, request)}</p>
          <Button
            id={`color-keys-${pageId}-change-symbol`}
            type="button"
            variant="link"
            className="h-auto p-0"
            onClick={() => setPickerOpen(true)}
          >
            Change symbol
          </Button>
        </div>
      </div>

      <div className={cn(field, 'relative')}>
        <Label htmlFor={`${id}-code`}>Code</Label>
        <Input
          id={`${id}-code`}
          role="combobox"
          aria-expanded={showSuggestions}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            showSuggestions && activeSuggestion >= 0
              ? `${listboxId}-${activeSuggestion}`
              : undefined
          }
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="h-11 font-mono"
          maxLength={COLOR_KEY_LIMITS.code}
          // The row button that opened this form is gone; Code is where typing starts.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          value={code}
          onChange={event => {
            setCode(event.target.value);
            setSuggestOpen(true);
            setActiveSuggestion(-1);
          }}
          onFocus={() => setSuggestOpen(true)}
          onBlur={() => setSuggestOpen(false)}
          onKeyDown={onCodeKeyDown}
        />
        {showSuggestions ? (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Earlier codes"
            className="bg-popover border-border absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-md border shadow-md"
          >
            {suggestions.map((entry, index) => (
              // Keyboard selection is handled by the combobox input.
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events
              <li
                key={entry.code}
                id={`${listboxId}-${index}`}
                role="option"
                tabIndex={-1}
                aria-selected={index === activeSuggestion}
                onMouseDown={event => event.preventDefault()}
                onClick={() => applySuggestion(entry)}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center gap-2 px-3 text-sm',
                  index === activeSuggestion ? 'bg-muted' : 'hover:bg-muted/60'
                )}
              >
                <span
                  aria-hidden="true"
                  className="border-border size-4 shrink-0 rounded-full border"
                  style={{ background: safeSwatch(entry.swatch) ?? 'transparent' }}
                />
                <span className="font-mono">{entry.code}</span>
                {entry.color_name ? (
                  <span className="text-muted-foreground truncate">{entry.color_name}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className={field}>
        <Label htmlFor={`${id}-name`}>
          Color name <span className={hint}>optional</span>
        </Label>
        <Input
          id={`${id}-name`}
          className="h-11"
          maxLength={COLOR_KEY_LIMITS.colorName}
          value={colorName}
          onChange={event => setColorName(event.target.value)}
        />
      </div>

      <fieldset className={field}>
        <legend className="text-sm leading-none font-medium">
          Swatch <span className={hint}>optional</span>
        </legend>
        <div className="flex items-center gap-2 pt-1.5">
          <span className="relative size-11 shrink-0">
            <input
              type="color"
              aria-label="Swatch color"
              className="border-input size-11 cursor-pointer rounded-md border bg-transparent p-1"
              value={hasSwatch ? swatch.toLowerCase() : '#ffffff'}
              onChange={event => setSwatch(event.target.value.toUpperCase())}
            />
            {hasSwatch ? null : (
              <span
                aria-hidden="true"
                className="border-border bg-background pointer-events-none absolute inset-1 rounded-sm border border-dashed"
              />
            )}
          </span>
          <Input
            aria-label="Swatch hex"
            placeholder="Like #A1B2C3"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="h-11 font-mono"
            maxLength={7}
            value={swatch}
            onChange={event => setSwatch(event.target.value.trim())}
            onBlur={tidySwatch}
          />
          {swatch ? (
            <Button type="button" variant="ghost" onClick={() => setSwatch('')}>
              Clear
            </Button>
          ) : null}
        </div>
      </fieldset>

      <div className={field}>
        <Label htmlFor={`${id}-tried`}>
          Tried first <span className={hint}>optional</span>
        </Label>
        {tried.length ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Codes tried first">
            {tried.map(value => (
              <li
                key={value}
                className="bg-muted inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-3 font-mono text-sm"
              >
                {value}
                <button
                  type="button"
                  data-close-button
                  aria-label={`Remove ${value}`}
                  className="hover:bg-background/80 relative inline-flex size-6 items-center justify-center rounded-full after:absolute after:-inset-2.5 after:content-['']"
                  onClick={event => removeTried(value, event)}
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex gap-2">
          <Input
            ref={triedInput}
            id={`${id}-tried`}
            aria-label="Add a code you tried"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="h-11 font-mono"
            maxLength={COLOR_KEY_LIMITS.code}
            disabled={tried.length >= COLOR_KEY_LIMITS.tried}
            value={triedDraft}
            onChange={event => setTriedDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              addTried();
            }}
          />
          <Button
            type="button"
            variant="glass"
            className="h-11"
            disabled={!triedDraft.trim() || tried.length >= COLOR_KEY_LIMITS.tried}
            onClick={addTried}
          >
            Add
          </Button>
        </div>
      </div>

      <div className={field}>
        <Label htmlFor={`${id}-note`}>
          Note <span className={hint}>optional</span>
        </Label>
        <Textarea
          id={`${id}-note`}
          rows={2}
          placeholder="Anything to remember"
          maxLength={COLOR_KEY_LIMITS.note}
          value={note}
          onChange={event => setNote(event.target.value)}
        />
      </div>

      {error ? (
        <p role="alert" className="text-destructive-text text-sm">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {row ? (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive-text mr-auto h-11"
            disabled={busy}
            onClick={() => void onDelete()}
          >
            Delete
          </Button>
        ) : null}
        <Button type="button" variant="ghost" className="h-11" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="glass" className="h-11 flex-1" disabled={busy}>
          Save
        </Button>
        {next ? (
          <Button
            type="button"
            className="h-11 flex-[2]"
            disabled={busy}
            onClick={() => void save('next')}
          >
            Save and next: {symbolDisplayName(next.symbol, requestFor(next.symbol, requests))}
          </Button>
        ) : null}
      </div>

      <SymbolPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        userId={userId}
        title="Change symbol"
        onCloseAutoFocus={event => {
          event.preventDefault();
          document.getElementById(`color-keys-${pageId}-change-symbol`)?.focus();
        }}
        onRequestSymbol={
          onRequestSymbol &&
          (() => {
            setPickerOpen(false);
            // Only one entry is open at a time; a remount by another device keeps this id.
            onRequestSymbol(() =>
              (
                document.getElementById(`color-keys-${pageId}-change-symbol`) ??
                document.getElementById(`color-keys-${pageId}`)
              )?.focus()
            );
          })
        }
        onPick={picked => {
          onSymbolChange(picked);
          setPickerOpen(false);
        }}
      />
      <ConfirmationDialog />
    </form>
  );
}
