import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  RANDOMIZER_MODE_LABELS,
  type RandomizerEligibility,
  type RandomizerMode,
} from '@/types/randomizer';

interface RandomizerControlsPanelProps {
  mode: RandomizerMode;
  eligibility: RandomizerEligibility;
  onEligibilityChange: (patch: Partial<RandomizerEligibility>) => void;
  onResetEligibility: () => void;
}

const DIAMOND_STATUS_OPTIONS = [
  { value: 'progress', label: 'In progress' },
  { value: 'kitted', label: 'Kitted up' },
  { value: 'onhold', label: 'On hold' },
];

const BOOK_STATUS_OPTIONS = [
  { value: 'purchased', label: 'Purchased' },
  { value: 'in_stash', label: 'On Bookshelf (Not Started)' },
  { value: 'in_progress', label: 'In progress' },
];

const PAGE_STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not started' },
  { value: 'palette_chosen', label: 'Palette chosen' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'on_hold', label: 'On hold' },
];

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter(item => item !== value) : [...values, value];
}

export function RandomizerCraftSelector({
  mode,
  canUseDiamond,
  canUseColoring,
  onModeChange,
}: {
  mode: RandomizerMode;
  canUseDiamond: boolean;
  canUseColoring: boolean;
  onModeChange: (mode: RandomizerMode) => void;
}) {
  const modes = (['diamond', 'coloring-book', 'coloring-page'] as const).filter(value =>
    value === 'diamond' ? canUseDiamond : canUseColoring
  );

  return (
    <div role="group" aria-label="Craft" className="border-border/60 mb-6 flex border-b">
      {modes.map(value => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => onModeChange(value)}
          className={cn(
            'focus-visible:ring-ring/50 min-h-11 min-w-0 flex-1 border-b-2 px-2 py-3 text-sm font-semibold whitespace-normal focus-visible:ring-[3px] sm:flex-none sm:px-4',
            mode === value
              ? 'border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground border-transparent'
          )}
        >
          {RANDOMIZER_MODE_LABELS[value]}
        </button>
      ))}
    </div>
  );
}

export function RandomizerControlsPanel({
  mode,
  eligibility,
  onEligibilityChange,
  onResetEligibility,
}: RandomizerControlsPanelProps) {
  const statusOptions =
    mode === 'coloring-book'
      ? BOOK_STATUS_OPTIONS
      : mode === 'coloring-page'
        ? PAGE_STATUS_OPTIONS
        : DIAMOND_STATUS_OPTIONS;
  const activeStatuses =
    mode === 'coloring-book'
      ? eligibility.bookStatuses
      : mode === 'coloring-page'
        ? eligibility.pageStatuses
        : eligibility.diamondStatuses;
  const statusKey =
    mode === 'coloring-book'
      ? 'bookStatuses'
      : mode === 'coloring-page'
        ? 'pageStatuses'
        : 'diamondStatuses';

  return (
    <div className="flex flex-col items-start gap-2">
      <fieldset className="space-y-2">
        <legend className="text-foreground text-sm font-semibold">
          {mode === 'coloring-book'
            ? 'Book status'
            : mode === 'coloring-page'
              ? 'Page status'
              : 'Project status'}
        </legend>
        <p className="text-muted-foreground text-sm">
          Include{' '}
          {mode === 'coloring-book' ? 'books' : mode === 'coloring-page' ? 'pages' : 'projects'}{' '}
          with these statuses.
        </p>
        <div className="flex flex-wrap gap-2">
          {statusOptions.map(option => (
            <label
              key={option.value}
              className="flex min-h-11 cursor-pointer items-center gap-2 pr-4 text-sm font-medium"
            >
              <Checkbox
                checked={activeStatuses.includes(option.value)}
                onCheckedChange={() =>
                  onEligibilityChange({
                    [statusKey]: toggleValue(activeStatuses, option.value),
                  } as Partial<RandomizerEligibility>)
                }
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <Button type="button" variant="link" size="sm" className="px-0" onClick={onResetEligibility}>
        Reset filters
      </Button>
    </div>
  );
}
