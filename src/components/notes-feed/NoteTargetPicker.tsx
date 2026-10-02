import { PrivateFileImage } from '@/components/image/PrivateFileImage';
import { useMemo, useState } from 'react';
import { ChevronRight, Gem, Image as ImageIcon, Palette, Search } from 'lucide-react';

import { ProgressNoteDialog } from '@/components/projects/ProgressNoteDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useBookNoteTargets } from '@/hooks/queries/useBookNoteTargets';
import { useNoteTargets } from '@/hooks/queries/useNoteTargets';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAddNoteFlow, type AddNoteData } from '@/hooks/useAddNoteFlow';
import { cn } from '@/lib/utils';
import type { VerticalToggles } from '@/services/pocketbase/dashboardSettings.service';
import type { NoteTarget } from '@/services/pocketbase/overview.service';

export type PickerMode = { kind: 'targets' } | { kind: 'book'; bookId: string };

interface NoteTargetPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: PickerMode;
  verticals?: VerticalToggles;
}

const TARGETS_MODE: PickerMode = { kind: 'targets' };
const MIN_SEARCH_LENGTH = 2;
const SKELETON_KEYS = ['first', 'second', 'third', 'fourth'];

const MODE_COPY = {
  targets: {
    heading: 'In-progress pages and projects',
    searchLabel: 'Search kits and pages',
    searchPlaceholder: 'Search kits and pages',
  },
  book: {
    heading: 'Pages in this book',
    searchLabel: 'Search pages in this book',
    searchPlaceholder: 'Search pages',
  },
} as const;

const CRAFT_ICON = {
  'diamond-project': Gem,
  'coloring-page': Palette,
} as const;

function TargetRow({
  target,
  onSelect,
}: {
  target: NoteTarget;
  onSelect: (target: NoteTarget) => void;
}) {
  const CraftIcon = CRAFT_ICON[target.kind];

  return (
    <button
      type="button"
      onClick={() => onSelect(target)}
      className={cn(
        'group border-border/60 hover:bg-muted/40 focus-visible:ring-ring/50 grid w-full',
        'grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 border-b py-3 text-left',
        'transition-colors last:border-b-0 focus-visible:ring-[3px] focus-visible:outline-none'
      )}
    >
      <span className="bg-muted relative block aspect-square overflow-hidden rounded-lg">
        {target.thumbnailUrl ? (
          <PrivateFileImage
            src={target.thumbnailUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <span className="text-muted-foreground flex size-full items-center justify-center">
            <ImageIcon aria-hidden="true" className="size-4" />
          </span>
        )}
      </span>

      <span className="min-w-0">
        <span className="text-foreground group-hover:text-primary flex items-center gap-1.5 text-sm font-semibold transition-colors">
          <CraftIcon aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0" />
          <span className="truncate">{target.title}</span>
        </span>
        {target.subtitle ? (
          <span className="text-muted-foreground mt-0.5 block truncate text-xs">
            {target.subtitle}
          </span>
        ) : null}
      </span>

      <ChevronRight
        aria-hidden="true"
        className="text-muted-foreground group-hover:text-primary size-4 transition-colors"
      />
    </button>
  );
}

function TargetList({
  targets,
  isLoading,
  error,
  emptyMessage,
  onSelect,
}: {
  targets: NoteTarget[];
  isLoading: boolean;
  error: boolean;
  emptyMessage: string;
  onSelect: (target: NoteTarget) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {SKELETON_KEYS.map(key => (
          <div key={key} className="flex items-center gap-3">
            <Skeleton className="size-12 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-destructive-text py-8 text-center text-sm">
        Could not load your kits and pages. Please try again.
      </p>
    );
  }

  if (targets.length === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">{emptyMessage}</p>;
  }

  return (
    <div>
      {targets.map(target => (
        <TargetRow key={`${target.kind}:${target.id}`} target={target} onSelect={onSelect} />
      ))}
    </div>
  );
}

function filterBookTargets(targets: NoteTarget[], searchTerm: string): NoteTarget[] {
  const normalized = searchTerm.trim().toLocaleLowerCase();
  if (normalized.length < MIN_SEARCH_LENGTH) return targets;

  return targets.filter(target =>
    [target.title, target.subtitle].some(value => value.toLocaleLowerCase().includes(normalized))
  );
}

export function NoteTargetPicker({
  open,
  onOpenChange,
  mode = TARGETS_MODE,
  verticals,
}: NoteTargetPickerProps) {
  const isMobile = useIsMobile();
  const [selectedTarget, setSelectedTarget] = useState<NoteTarget | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { submitNote, isSubmitting } = useAddNoteFlow();

  const isBookMode = mode.kind === 'book';
  const trimmedSearchTerm = searchTerm.trim();
  const activeSearchTerm = trimmedSearchTerm.length >= MIN_SEARCH_LENGTH ? trimmedSearchTerm : '';
  const noteTargetsQuery = useNoteTargets({
    enabled: open && !isBookMode,
    searchTerm: activeSearchTerm,
    verticals,
  });
  const bookQuery = useBookNoteTargets(isBookMode ? mode.bookId : undefined, {
    enabled: open && isBookMode,
  });
  const activeQuery = isBookMode ? bookQuery : noteTargetsQuery;
  const visibleTargets = useMemo(
    () =>
      isBookMode
        ? filterBookTargets(activeQuery.data ?? [], trimmedSearchTerm)
        : (activeQuery.data ?? []),
    [activeQuery.data, isBookMode, trimmedSearchTerm]
  );

  const copy = MODE_COPY[mode.kind];
  const isSearching = trimmedSearchTerm.length >= MIN_SEARCH_LENGTH;
  const emptyMessage = isSearching
    ? isBookMode
      ? 'No pages in this book match your search.'
      : 'No kits or pages match your search.'
    : isBookMode
      ? 'This book has no pages yet. Add a page first.'
      : 'Nothing is in progress right now. Search for another kit or coloring page, or create one first.';

  const closeAll = () => {
    setSelectedTarget(null);
    setSearchTerm('');
    onOpenChange(false);
  };

  const handleSubmit = async (noteData: AddNoteData) => {
    if (!selectedTarget) return false;
    await submitNote(selectedTarget, noteData);
    closeAll();
    return true;
  };

  const listOpen = open && selectedTarget === null;
  const list = (
    <TargetList
      targets={visibleTargets}
      isLoading={activeQuery.isLoading}
      error={!!activeQuery.error}
      emptyMessage={emptyMessage}
      onSelect={setSelectedTarget}
    />
  );

  return (
    <>
      {isMobile ? (
        <Drawer open={listOpen} onOpenChange={value => !value && closeAll()}>
          <DrawerContent className="h-[70dvh]">
            <DrawerTitle className="sr-only">{copy.heading}</DrawerTitle>
            <div className="flex h-full flex-col">
              <header className="space-y-3 px-4 pt-2 pb-3">
                <h2 className="text-lg font-semibold">{copy.heading}</h2>
                <div className="relative">
                  <Search
                    aria-hidden="true"
                    className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                  />
                  <Input
                    type="search"
                    value={searchTerm}
                    onChange={event => setSearchTerm(event.target.value)}
                    aria-label={copy.searchLabel}
                    placeholder={copy.searchPlaceholder}
                    className="pl-9"
                  />
                </div>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {list}
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={listOpen} onOpenChange={value => !value && closeAll()}>
          <DialogContent className="flex max-h-[70dvh] flex-col overflow-hidden">
            <DialogHeader>
              <DialogTitle>{copy.heading}</DialogTitle>
            </DialogHeader>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              />
              <Input
                type="search"
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                aria-label={copy.searchLabel}
                placeholder={copy.searchPlaceholder}
                className="pl-9"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{list}</div>
          </DialogContent>
        </Dialog>
      )}

      <ProgressNoteDialog
        open={selectedTarget !== null}
        onOpenChange={value => !value && closeAll()}
        onSubmit={handleSubmit}
        disabled={isSubmitting}
        target={selectedTarget ?? undefined}
      />
    </>
  );
}
