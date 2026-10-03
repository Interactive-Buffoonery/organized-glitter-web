import { useState } from 'react';
import { usePostHog } from '@posthog/react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { notify } from '@/lib/notifications';
import { useAuth } from '@/hooks/useAuth';
import { useEnabledVerticals } from '@/hooks/useEnabledVerticals';
import { useSaveVerticalToggles } from '@/hooks/mutations/useSaveVerticalToggles';
import { AnalyticsEvent } from '@/services/analytics-events';

type VerticalKey = 'diamond_painting' | 'coloring_books';

/**
 * Hobby tracker switches that autosave on toggle.
 *
 * Optimistic flow: clicking a switch flips the local pending value
 * immediately and fires the mutation. On error, we roll back. We refuse
 * to persist a state where both trackers are off (would orphan the user
 * from any vertical), and surface that as inline copy without a toast.
 */
export function VerticalToggles() {
  const posthog = usePostHog();
  const { user } = useAuth();
  const persisted = useEnabledVerticals(user?.id);
  const saveMutation = useSaveVerticalToggles(user?.id);

  // Optimistic overrides keyed by vertical. While a save is in flight we
  // show this; once the mutation settles we clear it and read from
  // `persisted` again (the query cache will have been invalidated).
  const [pending, setPending] = useState<Partial<Record<VerticalKey, boolean>>>({});

  const diamond = pending.diamond_painting ?? persisted.diamond_painting;
  const coloring = pending.coloring_books ?? persisted.coloring_books;

  const persist = async (key: VerticalKey, next: boolean) => {
    if (!user?.id || persisted.isLoading) return;

    const wouldBeBothOff = key === 'diamond_painting' ? !next && !coloring : !diamond && !next;

    if (wouldBeBothOff) {
      // Block the toggle locally so the UI stays consistent with the
      // server. The inline "pick at least one" copy below tells the user
      // why nothing happened.
      return;
    }

    setPending(prev => ({ ...prev, [key]: next }));

    try {
      await saveMutation.mutateAsync({
        userId: user.id,
        verticals: {
          diamond_painting: key === 'diamond_painting' ? next : diamond,
          coloring_books: key === 'coloring_books' ? next : coloring,
        },
      });
      posthog.capture(AnalyticsEvent.VERTICAL_PREFERENCES_UPDATED, {
        surface: 'profile',
        diamond_enabled: key === 'diamond_painting' ? next : diamond,
        coloring_enabled: key === 'coloring_books' ? next : coloring,
        changed_diamond: key === 'diamond_painting',
        changed_coloring: key === 'coloring_books',
      });
    } catch (error) {
      notify({
        kind: 'error',
        title: 'Could not save preferences',
        description: error instanceof Error ? error.message : 'Please try again in a moment.',
      });
    } finally {
      setPending(prev => {
        const { [key]: _removed, ...rest } = prev;
        return rest;
      });
    }
  };

  const bothOff = !diamond && !coloring;
  const disabled = persisted.isLoading || saveMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="vertical-diamond" className="text-base font-medium">
            Diamond paintings
          </Label>
          <p className="text-muted-foreground text-sm">
            Track diamond painting projects, stash, and progress notes.
          </p>
        </div>
        <Switch
          id="vertical-diamond"
          checked={diamond}
          onCheckedChange={next => void persist('diamond_painting', next)}
          disabled={disabled || (diamond && !coloring)}
        />
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="vertical-coloring" className="text-base font-medium">
            Coloring books
          </Label>
          <p className="text-muted-foreground text-sm">
            Track coloring books, page status, and mystery reveals.
          </p>
        </div>
        <Switch
          id="vertical-coloring"
          checked={coloring}
          onCheckedChange={next => void persist('coloring_books', next)}
          disabled={disabled || (coloring && !diamond)}
        />
      </div>

      {bothOff && (
        <p className="text-destructive-text text-sm" role="status">
          Pick at least one tracker.
        </p>
      )}
    </div>
  );
}
