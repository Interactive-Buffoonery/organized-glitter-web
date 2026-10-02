import { useLayoutEffect, useRef, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Pin, Shuffle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DiamondSectionHelper } from './DiamondSectionHelper';
import { RandomizerNoteDialog } from './RandomizerNoteDialog';
import {
  RANDOMIZER_TARGET_TYPE_LABELS,
  type RandomizerNextUpTarget,
  type RandomizerSection,
  type RandomizerTarget,
} from '@/types/randomizer';

type ProgressNoteAction = {
  onSave: (content: string) => Promise<void>;
  getDefault: () => string;
  isSaving?: boolean;
};

type RandomizerNoteAction = {
  onSave: (content: string) => Promise<void>;
  getDefault: () => string;
  isSaving?: boolean;
};

type PagePickerAction = {
  onPick: (target: RandomizerTarget) => Promise<void>;
  isPicking?: boolean;
  error?: string | null;
  errorReason?: string | null;
};

type NextUpAction = {
  target?: RandomizerNextUpTarget | null;
  onToggle: (target: RandomizerTarget) => void | Promise<void>;
  isSaving?: boolean;
};

interface RandomizerResultPanelProps {
  target: RandomizerTarget | null;
  section: RandomizerSection | null;
  onSectionChange: (section: RandomizerSection) => void | Promise<void>;
  progressNote: ProgressNoteAction;
  randomizerNote?: RandomizerNoteAction;
  pagePicker?: PagePickerAction;
  nextUp?: NextUpAction;
  onClear: () => void;
}

function ResultHeader({
  target,
  onClear,
  headingRef,
}: {
  target: RandomizerTarget;
  onClear: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-muted-foreground text-sm">
          Selected {RANDOMIZER_TARGET_TYPE_LABELS[target.targetType].toLowerCase()}
        </p>
        <h2 ref={headingRef} tabIndex={-1} className="text-foreground mt-1 text-xl font-semibold">
          {target.title}
        </h2>
        {target.subtitle && <p className="text-muted-foreground mt-1 text-sm">{target.subtitle}</p>}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onClear}
        aria-label="Clear result"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

function ResultActions({ target, nextUp }: { target: RandomizerTarget; nextUp?: NextUpAction }) {
  const isSavedNextUp = nextUp?.target?.id === target.id;
  const viewLabel =
    target.targetType === 'diamond_project'
      ? 'View project'
      : target.targetType === 'coloring_book'
        ? 'View book'
        : 'View page';

  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="glass">
        <Link to={target.href}>
          <ExternalLink className="mr-2 size-4" />
          {viewLabel}
        </Link>
      </Button>

      {nextUp && (
        <Button
          type="button"
          variant={isSavedNextUp ? 'secondary' : 'outline'}
          onClick={() => nextUp.onToggle(target)}
          disabled={nextUp.isSaving}
          aria-pressed={isSavedNextUp}
        >
          <Pin className="mr-2 size-4" />
          {isSavedNextUp ? 'Saved next up' : 'Set as next up'}
        </Button>
      )}
    </div>
  );
}

function ColoringBookResultDetails({
  target,
  pagePicker,
  focusWithin,
}: {
  target: RandomizerTarget;
  pagePicker: PagePickerAction;
  focusWithin: RefObject<boolean>;
}) {
  return (
    <div
      className="border-border/60 space-y-3 border-t pt-4"
      onFocusCapture={() => {
        focusWithin.current = true;
      }}
      onBlurCapture={event => {
        if (event.relatedTarget) focusWithin.current = false;
      }}
    >
      <div className="space-y-1">
        <h3 className="text-foreground text-sm font-semibold">Pick a page too?</h3>
        <p className="text-muted-foreground text-sm">{target.title} only</p>
        <p className="text-muted-foreground text-sm">Eligible: Any unfinished page</p>
      </div>
      <Button
        type="button"
        variant="glass"
        size="sm"
        onClick={() => pagePicker.onPick(target)}
        disabled={pagePicker.isPicking}
      >
        <Shuffle className="mr-2 size-4" />
        {pagePicker.isPicking ? 'Picking…' : 'Pick a page'}
      </Button>
      {pagePicker.error && (
        <p
          role="alert"
          data-reason={pagePicker.errorReason ?? 'page_pick_failed'}
          className="text-destructive-text text-sm"
        >
          {pagePicker.error}
        </p>
      )}
    </div>
  );
}

function ColoringPageResultDetails({ randomizerNote }: { randomizerNote: RandomizerNoteAction }) {
  return (
    <div className="border-border/60 border-t pt-4">
      <RandomizerNoteDialog
        defaultContent={randomizerNote.getDefault()}
        onSave={randomizerNote.onSave}
        isSaving={randomizerNote.isSaving}
      />
    </div>
  );
}

export function RandomizerResultPanel({
  target,
  section,
  onSectionChange,
  progressNote,
  randomizerNote,
  pagePicker,
  nextUp,
  onClear,
}: RandomizerResultPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pagePickerHasFocus = useRef(false);
  useLayoutEffect(() => {
    if (
      pagePickerHasFocus.current &&
      target?.targetType === 'coloring_page' &&
      document.activeElement === document.body
    ) {
      headingRef.current?.focus();
    }
    pagePickerHasFocus.current = false;
  }, [target?.id, target?.targetType]);

  if (!target) return null;

  return (
    <div className="border-border/60 mt-6 w-full max-w-xl space-y-4 border-t pt-4">
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {pagePicker?.isPicking
          ? 'Picking a page…'
          : target.targetType === 'coloring_page'
            ? `Selected page: ${target.title}`
            : ''}
      </p>
      <ResultHeader target={target} onClear={onClear} headingRef={headingRef} />
      <ResultActions target={target} nextUp={nextUp} />

      {target.targetType === 'diamond_project' && (
        <DiamondSectionHelper
          key={`${target.targetType}:${target.id}`}
          target={target}
          section={section}
          onSectionChange={onSectionChange}
        />
      )}

      {target.targetType === 'diamond_project' && (
        <RandomizerNoteDialog
          defaultContent={progressNote.getDefault()}
          triggerLabel="Save progress note"
          title="Save progress note"
          description="Add an optional progress note to the selected diamond painting."
          textareaLabel="Progress note"
          onSave={progressNote.onSave}
          isSaving={progressNote.isSaving}
        />
      )}

      {target.targetType === 'coloring_book' && pagePicker && (
        <ColoringBookResultDetails
          target={target}
          pagePicker={pagePicker}
          focusWithin={pagePickerHasFocus}
        />
      )}

      {target.targetType === 'coloring_page' && randomizerNote && (
        <ColoringPageResultDetails randomizerNote={randomizerNote} />
      )}
    </div>
  );
}
