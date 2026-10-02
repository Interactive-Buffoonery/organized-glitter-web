import { ChevronRight, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';

import { showUserReportDialog } from '@/components/FeedbackDialogStore';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Skeleton } from '@/components/ui/skeleton';
import type { OverviewSnapshot } from '@/services/pocketbase/overview.service';

interface OverviewRightRailProps {
  snapshot: OverviewSnapshot;
  canUseDiamond: boolean;
  canUseColoring: boolean;
  isLoading: boolean;
}

const QUICK_LINKS = [
  { label: 'Manage diamond paintings', href: '/dashboard' },
  { label: 'Manage coloring books', href: '/dashboard?craft=coloring' },
  { label: 'Import content', href: '/profile?tab=data' },
  { label: 'Randomizer', href: '/randomizer' },
  { label: 'Stats', href: '/stats' },
];

export function OverviewRightRail({
  snapshot,
  canUseDiamond,
  canUseColoring,
  isLoading,
}: OverviewRightRailProps) {
  const quickLinks = QUICK_LINKS.filter(link => {
    if (link.href === '/dashboard') return canUseDiamond;
    if (link.href === '/dashboard?craft=coloring') return canUseColoring;
    return true;
  });
  const snapshotRows = [
    canUseDiamond
      ? { label: 'Diamond paintings in progress', value: snapshot.diamondActiveCount }
      : null,
    canUseColoring
      ? { label: 'Coloring pages in progress', value: snapshot.coloringPageInProgressCount }
      : null,
    { label: 'Completed this month', value: snapshot.completedThisMonthCount },
  ].filter(row => row !== null);

  return (
    <GlassPanel
      role="complementary"
      aria-labelledby="overview-quick-links-heading"
      className="self-start p-5 sm:p-6"
    >
      <section aria-labelledby="overview-quick-links-heading">
        <h2
          id="overview-quick-links-heading"
          className="text-foreground text-base font-semibold tracking-tight"
        >
          Quick links
        </h2>
        <div className="border-border/60 mt-5 divide-y">
          {quickLinks.map(link => (
            <Link
              key={link.href}
              to={link.href}
              className="text-foreground hover:text-primary flex items-center justify-between gap-4 py-4 text-sm font-medium transition-colors"
            >
              {link.label}
              <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
            </Link>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="overview-snapshot-heading"
        className="border-border/60 mt-7 border-t pt-7"
      >
        <h2
          id="overview-snapshot-heading"
          className="text-foreground text-base font-semibold tracking-tight"
        >
          Library snapshot
        </h2>
        <div className="border-border/60 mt-5 divide-y">
          {snapshotRows.map(row => (
            <div key={row.label} className="flex items-center justify-between gap-4 py-3">
              <span className="text-muted-foreground text-sm">{row.label}</span>
              {isLoading ? (
                <Skeleton className="h-5 w-8" />
              ) : (
                <span className="text-foreground text-base font-semibold tabular-nums">
                  {row.value}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="border-border/60 mt-7 border-t pt-6">
        <div className="flex gap-3">
          <Heart
            aria-hidden="true"
            className="text-muted-foreground mt-0.5 size-4 shrink-0"
            strokeWidth={1.75}
          />
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-sm leading-relaxed">
              Thank you for being part of
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Organized Glitter, I am SO glad
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              to have you here. If you have any
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              feedback or bug reports to share,
            </p>
            <button
              type="button"
              onClick={() =>
                showUserReportDialog({
                  title: 'Share Your Feedback',
                  subtitle: "We'd love to hear your thoughts about Organized Glitter!",
                  currentPage: 'Overview - Right Rail',
                })
              }
              className="text-foreground decoration-primary/50 hover:decoration-primary focus-visible:ring-ring/50 font-medium underline decoration-2 underline-offset-4 transition-colors focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:outline-none"
            >
              please send me a message
            </button>
            <p className="text-muted-foreground text-sm leading-relaxed">Happy crafting!</p>
          </div>
        </div>

        <div className="mt-8 flex justify-end pr-8">
          <div className="origin-center -rotate-[4deg] text-center">
            <p className="font-handwritten text-foreground text-[30px] leading-none italic">
              ~ Sarah
            </p>
            <svg
              aria-hidden="true"
              className="text-primary/55 mt-1 h-3 w-24"
              viewBox="0 0 96 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M2 8C8 5 14 5 20 8C26 11 32 11 38 8C44 5 50 5 56 8C62 11 68 11 74 8C80 5 86 5 94 8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}
