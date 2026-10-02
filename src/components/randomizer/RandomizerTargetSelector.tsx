import { PrivateFileImage } from '@/components/image/PrivateFileImage';
import { useId, useMemo, useRef, useState } from 'react';
import { Check, Circle, Image as ImageIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { RandomizerTarget } from '@/types/randomizer';

interface RandomizerTargetSelectorProps {
  title?: string;
  targets: RandomizerTarget[];
  selectedTargetIds: Set<string>;
  onTargetToggle: (targetId: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  isLoading?: boolean;
  disableScrollArea?: boolean;
}

export function RandomizerTargetSelector({
  title = 'Projects',
  targets,
  selectedTargetIds,
  onTargetToggle,
  onSelectAll,
  onSelectNone,
  isLoading = false,
  disableScrollArea = false,
}: RandomizerTargetSelectorProps) {
  const searchId = useId();
  const [search, setSearch] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const visibleTargets = targets.filter(target =>
    `${target.title} ${target.subtitle ?? ''}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase())
  );
  const wheelNumbers = useMemo(() => {
    const numbers = new Map<string, number>();
    for (const target of targets) {
      if (selectedTargetIds.has(target.id)) numbers.set(target.id, numbers.size + 1);
    }
    return numbers;
  }, [targets, selectedTargetIds]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">{title}</h3>
          <span className="text-muted-foreground text-sm">Loading…</span>
        </div>
        <div className="border-border/60 divide-border/60 divide-y border-y">
          {[1, 2, 3].map(item => (
            <div key={item} className="flex items-center gap-3 py-3">
              <div className="bg-muted size-10 animate-pulse rounded-md" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="bg-muted h-4 w-3/4 animate-pulse rounded" />
                <div className="bg-muted/70 h-3 w-1/2 animate-pulse rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (targets.length === 0) {
    return (
      <div className="space-y-3">
        <h3 className="text-base font-semibold">{title}</h3>
        <div className="border-border/60 text-muted-foreground border-y px-4 py-8 text-center text-sm">
          Nothing matches these filters.
        </div>
      </div>
    );
  }

  const selectedCount = targets.filter(target => selectedTargetIds.has(target.id)).length;

  const list = (
    <div ref={listRef} className="border-border/60 divide-border/60 divide-y border-y">
      {visibleTargets.map((target, index) => {
        const isSelected = selectedTargetIds.has(target.id);

        return (
          <button
            key={target.id}
            type="button"
            aria-pressed={isSelected}
            aria-label={`${isSelected ? 'Deselect' : 'Select'} ${target.title}. ${isSelected ? `Wheel number ${wheelNumbers.get(target.id)}. ` : ''}${
              target.statusLabel
            }. ${target.subtitle || 'No details'}`}
            onClick={() => onTargetToggle(target.id)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onTargetToggle(target.id);
              }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const nextIndex =
                  event.key === 'ArrowDown'
                    ? Math.min(index + 1, visibleTargets.length - 1)
                    : Math.max(index - 1, 0);
                const next = listRef.current?.querySelector<HTMLElement>(
                  `[data-randomizer-target-index="${nextIndex}"]`
                );
                next?.focus();
              }
              if (event.key === 'Home') {
                event.preventDefault();
                listRef.current
                  ?.querySelector<HTMLElement>('[data-randomizer-target-index="0"]')
                  ?.focus();
              }
              if (event.key === 'End') {
                event.preventDefault();
                listRef.current
                  ?.querySelector<HTMLElement>(
                    `[data-randomizer-target-index="${visibleTargets.length - 1}"]`
                  )
                  ?.focus();
              }
            }}
            data-randomizer-target-index={index}
            className={cn(
              'focus-visible:ring-ring/50 flex w-full items-center gap-3 py-3 text-left transition-colors focus-visible:ring-[3px] focus-visible:outline-none',
              'hover:bg-secondary/40 rounded-sm px-1'
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex size-4 shrink-0 items-center justify-center rounded border',
                isSelected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-muted-foreground'
              )}
            >
              {isSelected && <Check className="size-3" />}
            </span>
            <span className="bg-muted relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md">
              {target.imageUrl ? (
                <PrivateFileImage src={target.imageUrl} alt="" className="size-full object-cover" />
              ) : (
                <ImageIcon className="text-muted-foreground size-5" aria-hidden="true" />
              )}
            </span>

            <span className="min-w-0 flex-1">
              <span className="text-foreground block text-sm leading-snug font-semibold break-words">
                {target.title}
              </span>
              <span className="text-muted-foreground block text-xs leading-relaxed break-words">
                {target.subtitle}
              </span>
              <span className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                <Circle className="size-2" aria-hidden="true" />
                {target.statusLabel}
              </span>
            </span>

            {isSelected && (
              <span className="text-muted-foreground text-xs tabular-nums" aria-hidden="true">
                {wheelNumbers.get(target.id)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-muted-foreground text-sm">
            {selectedCount} of {targets.length} selected
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="link" size="sm" onClick={onSelectAll}>
            Select all
          </Button>
          <Button type="button" variant="link" size="sm" onClick={onSelectNone}>
            Deselect all
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor={searchId} className="text-muted-foreground text-sm">
          Search {title.toLowerCase()}
        </label>
        <Input
          id={searchId}
          type="search"
          placeholder="Search by title or details"
          value={search}
          onChange={event => setSearch(event.target.value)}
        />
        <p className="text-muted-foreground text-xs">
          Search only changes the list. All selected items stay on the wheel.
        </p>
      </div>
      {visibleTargets.length === 0 && (
        <p role="status" className="text-muted-foreground py-6 text-sm">
          No items match your search.
        </p>
      )}
      {visibleTargets.length > 0 &&
        (disableScrollArea ? list : <ScrollArea className="min-h-0 flex-1">{list}</ScrollArea>)}
    </div>
  );
}
