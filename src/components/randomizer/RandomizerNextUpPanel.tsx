import { Link } from 'react-router-dom';
import { ExternalLink, Pin, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  RANDOMIZER_MODE_LABELS,
  type RandomizerMode,
  type RandomizerNextUpPreferences,
} from '@/types/randomizer';

type RandomizerNextUpPanelProps = {
  preferences: RandomizerNextUpPreferences;
  activeMode: RandomizerMode;
  canUseDiamond: boolean;
  canUseColoring: boolean;
  onClear: (mode: RandomizerMode) => void | Promise<void>;
  isSaving?: boolean;
  compact?: boolean;
};

const MODES: RandomizerMode[] = ['diamond', 'coloring-book', 'coloring-page'];

function isModeEnabled(mode: RandomizerMode, canUseDiamond: boolean, canUseColoring: boolean) {
  if (mode === 'diamond') return canUseDiamond;
  return canUseColoring;
}

export function RandomizerNextUpPanel({
  preferences,
  activeMode,
  canUseDiamond,
  canUseColoring,
  onClear,
  isSaving = false,
  compact = false,
}: RandomizerNextUpPanelProps) {
  const entries = MODES.flatMap(mode => {
    if (!isModeEnabled(mode, canUseDiamond, canUseColoring)) return [];

    const target = preferences.targets[mode];
    return target ? [{ mode, target }] : [];
  });

  if (compact) {
    const activeTarget = isModeEnabled(activeMode, canUseDiamond, canUseColoring)
      ? preferences.targets[activeMode]
      : undefined;

    return (
      <section className="border-border/60 border-y py-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Pin className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-foreground text-sm font-semibold">Next up</p>
              {activeTarget ? (
                <p className="text-muted-foreground truncate text-xs">{activeTarget.title}</p>
              ) : (
                <p className="text-muted-foreground text-xs italic">
                  Run the randomizer and save a choice. It will appear here.
                </p>
              )}
            </div>
          </div>
          {activeTarget && (
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="icon-sm" asChild>
                <Link to={activeTarget.href} aria-label={`View ${activeTarget.title}`}>
                  <ExternalLink className="size-4" />
                </Link>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onClear(activeMode)}
                disabled={isSaving}
                aria-label={`Clear next up for ${RANDOMIZER_MODE_LABELS[activeMode]}`}
              >
                <X className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Pin className="text-muted-foreground size-4" aria-hidden="true" />
        <h3 className="text-lg font-semibold">Next up</h3>
      </div>

      {entries.length === 0 ? (
        <div className="text-muted-foreground border-border/60 border-y py-6 text-center text-sm">
          Pin your next-up result here!
        </div>
      ) : (
        <div className="border-border/60 divide-border/60 divide-y border-y">
          {entries.map(({ mode, target }) => {
            if (!target) return null;

            return (
              <div key={mode} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-muted-foreground text-xs font-medium">
                      {RANDOMIZER_MODE_LABELS[mode]}
                    </p>
                    <p className="text-foreground mt-1 truncate text-sm font-semibold">
                      {target.title}
                    </p>
                    {target.subtitle && (
                      <p className="text-muted-foreground mt-1 truncate text-xs">
                        {target.subtitle}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon-sm" asChild>
                      <Link to={target.href} aria-label={`View ${target.title}`}>
                        <ExternalLink className="size-4" />
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onClear(mode)}
                      disabled={isSaving}
                      aria-label={`Clear next up for ${RANDOMIZER_MODE_LABELS[mode]}`}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
