import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Gem, BookOpen, CheckCircle2, MinusCircle } from 'lucide-react';
import { usePostHog } from '@posthog/react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { notify } from '@/lib/notifications';
import { useAuth } from '@/hooks/useAuth';
import { useEnabledVerticals } from '@/hooks/useEnabledVerticals';
import { useSaveVerticalToggles } from '@/hooks/mutations/useSaveVerticalToggles';
import { useMarkColoringWalkthroughSeen } from '@/hooks/mutations/useMarkColoringWalkthroughSeen';
import { AnalyticsEvent } from '@/services/analytics-events';

type Step = 1 | 2 | 3;
type VerticalKey = 'diamond_painting' | 'coloring_books';

const STEP_LABELS: Record<Step, string> = {
  1: "What's new",
  2: "How Organized Glitter's tracking works",
  3: 'Your trackers',
};

const SPINE_STATUSES = ['Wishlist', 'In Stash', 'In Progress', 'Completed'] as const;
const ACTIVE_SPINE_STATUS: (typeof SPINE_STATUSES)[number] = 'In Progress';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ColoringWalkthroughDialog({ open, onClose }: Props) {
  const [step, setStep] = useState<Step>(1);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const posthog = usePostHog();
  const { user } = useAuth();
  const persisted = useEnabledVerticals(user?.id);
  const saveMutation = useSaveVerticalToggles(user?.id);
  const markSeen = useMarkColoringWalkthroughSeen(user?.id);

  const [pending, setPending] = useState<Partial<Record<VerticalKey, boolean>>>({});
  const diamond = pending.diamond_painting ?? persisted.diamond_painting;
  const coloring = pending.coloring_books ?? persisted.coloring_books;
  const bothOff = !diamond && !coloring;
  const togglesDisabled = persisted.isLoading || saveMutation.isPending;

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => headingRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [step, open]);

  const handleClose = () => {
    if (user?.id && !markSeen.isPending) {
      markSeen.mutate();
    }
    setStep(1);
    setPending({});
    onClose();
  };

  const persist = async (key: VerticalKey, next: boolean) => {
    if (!user?.id || persisted.isLoading) return;

    const wouldBeBothOff = key === 'diamond_painting' ? !next && !coloring : !diamond && !next;
    if (wouldBeBothOff) return;

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
        surface: 'walkthrough',
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

  const nextLabel = step === 1 ? 'Show me how' : step === 2 ? 'Next' : "I'm all set";
  const trackerSummary =
    diamond && coloring
      ? 'Both trackers are currently on for your account.'
      : diamond
        ? 'Diamond painting is currently on for your account.'
        : coloring
          ? 'Coloring books are currently on for your account.'
          : 'Pick the tracker you want to use first.';
  const goNext = () => {
    if (step === 3) {
      handleClose();
    } else {
      setStep((step + 1) as Step);
    }
  };
  const goBack = () => {
    if (step > 1) setStep((step - 1) as Step);
  };

  return (
    <Dialog open={open} onOpenChange={isOpen => !isOpen && handleClose()}>
      <DialogContent
        layout="keyboard-safe-sheet"
        className="max-h-[92vh] gap-0 overflow-y-auto p-0 sm:max-w-[560px] sm:p-0"
      >
        <header className="flex items-center justify-between px-5 pt-5 pb-2 sm:px-6">
          <span className="text-muted-foreground inline-flex items-center gap-2 text-sm font-medium">
            <span className="bg-primary inline-block h-[2px] w-[18px] rounded-sm" />
            Step {step} of 3: {STEP_LABELS[step]}
          </span>
        </header>

        <div className="px-5 pt-2 pb-2 sm:px-6">
          {step === 1 && (
            <section>
              <DialogTitle asChild>
                <h2
                  ref={headingRef}
                  tabIndex={-1}
                  className="text-foreground mt-1 text-2xl leading-tight font-semibold outline-none sm:text-3xl"
                >
                  Organize both of your crafts
                </h2>
              </DialogTitle>
              <p className="text-foreground mt-3 text-[15.5px] leading-relaxed text-pretty">
                Welcome to Organized Glitter! You can now track both diamond paintings and coloring
                books through the full flow:
              </p>

              <div className="mt-6">
                <div className="flex flex-wrap items-center gap-1.5">
                  {SPINE_STATUSES.map((status, i) => (
                    <span key={status} className="inline-flex items-center gap-1.5">
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-1 text-[12.5px] whitespace-nowrap',
                          status === ACTIVE_SPINE_STATUS
                            ? 'bg-primary/10 text-primary dark:bg-primary/20 font-medium'
                            : 'bg-muted text-foreground'
                        )}
                      >
                        {status}
                      </span>
                      {i < SPINE_STATUSES.length - 1 && (
                        <ArrowRight className="text-muted-foreground size-3" aria-hidden="true" />
                      )}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          )}

          {step === 2 && (
            <section>
              <DialogTitle asChild>
                <h2
                  ref={headingRef}
                  tabIndex={-1}
                  className="text-foreground mt-1 text-2xl leading-tight font-semibold outline-none sm:text-3xl"
                >
                  Pick what you actually track
                </h2>
              </DialogTitle>
              <p className="text-foreground mt-3 text-[15.5px] leading-relaxed text-pretty">
                You can enable diamond painting, coloring, or both. The enabled options show up in
                your library, randomizer, and options tabs. If you deselect one, it stays out of the
                way, unless you decide you want it later.
              </p>

              <ol className="mt-5 flex flex-col gap-3.5">
                {[
                  {
                    bold: 'Both on by default.',
                    rest: ' Diamond paintings and coloring books are both enabled to start.',
                  },
                  {
                    bold: 'Switch one off any time.',
                    rest: " Hidden projects aren't deleted. Flip the disabled option back on and your projects are right where you left them.",
                  },
                  {
                    bold: 'At least one stays on.',
                    rest: ' Organized Glitter is a tracking application, so you do need to have at least one enabled.',
                  },
                ].map((row, index) => (
                  <li key={row.bold} className="flex items-start gap-3">
                    <span className="bg-primary/10 text-primary inline-grid size-7 flex-none place-items-center rounded-lg text-[13px] font-semibold">
                      {index + 1}
                    </span>
                    <p className="text-[14px] leading-snug">
                      <strong className="font-semibold">{row.bold}</strong>
                      <span className="text-muted-foreground">{row.rest}</span>
                    </p>
                  </li>
                ))}
              </ol>

              <p className="text-muted-foreground mt-5 text-[12.5px] leading-relaxed">
                Find this later in{' '}
                <span className="text-foreground font-medium">
                  Profile &rsaquo; Preferences &rsaquo; Trackers
                </span>
                .
              </p>
            </section>
          )}

          {step === 3 && (
            <section>
              <DialogTitle asChild>
                <h2
                  ref={headingRef}
                  tabIndex={-1}
                  className="text-foreground mt-1 text-2xl leading-tight font-semibold outline-none sm:text-3xl"
                >
                  Your current settings
                </h2>
              </DialogTitle>
              <p className="text-foreground mt-3 text-[15.5px] leading-relaxed text-pretty">
                <strong className="font-semibold">{trackerSummary}</strong> Want to keep it that
                way? You&rsquo;re already set. Want to switch? Use the tracker controls below:
              </p>

              <div className="mt-4 flex flex-col">
                <ToggleRow
                  icon={<Gem className="size-[18px]" aria-hidden="true" />}
                  iconTone="primary"
                  title="Diamond paintings"
                  blurb="Kits, stash, drill notes, finishing photos."
                  checked={diamond}
                  enabled={diamond}
                  onChange={next => void persist('diamond_painting', next)}
                  disabled={togglesDisabled || (diamond && !coloring)}
                  switchLabel="Toggle diamond paintings tracker"
                />
                <ToggleRow
                  icon={<BookOpen className="size-[18px]" aria-hidden="true" />}
                  iconTone="accent"
                  title="Coloring books"
                  blurb="Books, pages, mediums, mystery reveals."
                  checked={coloring}
                  enabled={coloring}
                  onChange={next => void persist('coloring_books', next)}
                  disabled={togglesDisabled || (coloring && !diamond)}
                  switchLabel="Toggle coloring books tracker"
                />
              </div>

              {bothOff && (
                <p className="text-destructive-text mt-3 text-[13px]" role="status">
                  Pick at least one tracker.
                </p>
              )}

              <p className="text-muted-foreground mt-4 text-[12.5px] leading-relaxed">
                Change your mind whenever under{' '}
                <span className="text-foreground font-medium">
                  Profile &rsaquo; Preferences &rsaquo; Trackers
                </span>
                .
              </p>
            </section>
          )}
        </div>

        <footer className="border-border/70 bg-background mt-4 flex items-center justify-between gap-4 border-t px-5 py-4 sm:px-6">
          <div className="flex gap-1.5" aria-hidden="true">
            {[1, 2, 3].map(n => (
              <span
                key={n}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  n === step ? 'bg-primary w-4' : 'bg-border w-1.5'
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={goBack}>
                Back
              </Button>
            )}
            <Button type="button" size="sm" onClick={goNext}>
              {nextLabel}
              {step < 3 && <ArrowRight className="ml-1 size-3.5" aria-hidden="true" />}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

interface ToggleRowProps {
  icon: React.ReactNode;
  iconTone: 'primary' | 'accent';
  title: string;
  blurb: string;
  checked: boolean;
  enabled: boolean;
  onChange: (next: boolean) => void;
  disabled: boolean;
  switchLabel: string;
}

function ToggleRow({
  icon,
  iconTone,
  title,
  blurb,
  checked,
  enabled,
  onChange,
  disabled,
  switchLabel,
}: ToggleRowProps) {
  return (
    <div className="border-border/70 flex items-start justify-between gap-4 border-t py-3.5 first:border-t-0">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            'inline-grid size-9 flex-none place-items-center rounded-[10px]',
            iconTone === 'primary'
              ? 'bg-primary/10 text-primary'
              : 'bg-accent/15 text-accent dark:bg-accent/20'
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <div className="inline-flex flex-wrap items-center gap-2 text-[15px] font-semibold">
            {title}
            <span
              className={cn(
                'inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-[11px] font-semibold',
                enabled
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              <span
                className={cn(
                  'inline-flex size-3 items-center justify-center',
                  enabled ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'
                )}
              >
                {enabled ? (
                  <CheckCircle2 className="size-3" aria-hidden="true" />
                ) : (
                  <MinusCircle className="size-3" aria-hidden="true" />
                )}
              </span>
              {enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-[13px] leading-snug">{blurb}</p>
        </div>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={switchLabel}
        className="mt-1 flex-none"
      />
    </div>
  );
}
