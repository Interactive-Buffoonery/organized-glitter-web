import { useEffect, useMemo, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { SectionHeading } from '@/components/shared/Section';
import {
  DefinitionTerm,
  LeadCompletionChart,
  MostRepresentedList,
  type MostRepresentedGroup,
  StatsCraftRegion,
  StatsEmptyState,
  StatsInlineRetry,
  StatsKeyValueColumn,
  StatsKeyValueRow,
  StatsRegionSkeleton,
  StatsScopeControl,
  StatsTimeScopeControl,
  type CraftScope,
} from '@/components/stats/StatsPrimitives';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppReady } from '@/hooks/useAppReady';
import { useAuth } from '@/hooks/useAuth';
import { useEnabledVerticals } from '@/hooks/useEnabledVerticals';
import {
  useCollectionStats,
  useColoringCollectionStats,
  useColoringCompletionTimeStats,
  useColoringCompletionsByMonth,
  useColoringCompletionsYearly,
  useColoringStatsSummary,
  useCompletionTimeStats,
  useCompletionsByMonth,
  useCompletionsYearly,
  useStatsSummary,
} from '@/hooks/queries/useStats';
import type {
  CollectionStatsResponse,
  ColoringCollectionStatsResponse,
  ColoringCompletionTimeStatsResponse,
  ColoringStatsSummaryResponse,
  CompletionTimeStatsResponse,
  CompletionsByMonthResponse,
  CompletionsYearlyResponse,
  StatsSplitItem,
  StatsSummaryResponse,
  StatsTimeScope,
  StatsTopListGroup,
  StatsTopListItem,
} from '@/types/stats';
import {
  monthlyCompletionsToChartPoints,
  normalizeTopListGroup,
  yearlyCompletionsToChartPoints,
} from '@/utils/stats';
import { formatStatsDays, formatStatsNumber } from '@/lib/utils';

const currentYear = new Date().getFullYear();

interface QueryState<T> {
  data?: T;
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
}

interface DiamondQueries {
  summary: QueryState<StatsSummaryResponse>;
  monthly: QueryState<CompletionsByMonthResponse>;
  yearly: QueryState<CompletionsYearlyResponse>;
  times: QueryState<CompletionTimeStatsResponse>;
  collection: QueryState<CollectionStatsResponse>;
}

interface ColoringQueries {
  summary: QueryState<ColoringStatsSummaryResponse>;
  monthly: QueryState<CompletionsByMonthResponse>;
  yearly: QueryState<CompletionsYearlyResponse>;
  times: QueryState<ColoringCompletionTimeStatsResponse>;
  collection: QueryState<ColoringCollectionStatsResponse>;
}

function retryAll(queries: readonly QueryState<unknown>[]) {
  queries.forEach(query => {
    void query.refetch();
  });
}

function getFallbackScope(
  scope: CraftScope,
  canUseDiamond: boolean,
  canUseColoring: boolean
): CraftScope {
  if (scope === 'all' && canUseDiamond && canUseColoring) return 'all';
  if (scope === 'diamond' && canUseDiamond) return 'diamond';
  if (scope === 'coloring' && canUseColoring) return 'coloring';
  if (canUseDiamond && canUseColoring) return 'all';
  if (canUseDiamond) return 'diamond';
  if (canUseColoring) return 'coloring';
  return 'all';
}

function topLabel(items: readonly StatsTopListItem[] | undefined, fallback: string): string {
  const item = items?.find(candidate => candidate.count > 0);
  return item?.label ?? fallback;
}

function topSplitLabel(items: readonly StatsSplitItem[] | undefined, fallback: string): string {
  const item = items?.find(candidate => candidate.count > 0);
  return item?.label ?? fallback;
}

function sizeGroup(collection: CollectionStatsResponse | undefined): StatsTopListGroup {
  const items =
    collection?.sizeBuckets.map(bucket => ({
      id: bucket.key,
      label: bucket.label,
      count: bucket.count,
    })) ?? [];
  return normalizeTopListGroup(
    items,
    items.reduce((sum, item) => sum + item.count, 0)
  );
}

function topListGroup(
  group: StatsTopListGroup | undefined,
  items: readonly StatsTopListItem[] | undefined
): StatsTopListGroup {
  return (
    group ??
    normalizeTopListGroup(items ?? [], items?.reduce((sum, item) => sum + item.count, 0) ?? 0)
  );
}

function yearsForControl(
  diamond: CompletionsYearlyResponse | undefined,
  coloring: CompletionsYearlyResponse | undefined,
  timeScope: StatsTimeScope
): number[] {
  const years = new Set([currentYear]);
  if (timeScope.kind === 'year') years.add(timeScope.year);
  diamond?.years.forEach(year => years.add(year.year));
  coloring?.years.forEach(year => years.add(year.year));
  return Array.from(years)
    .sort((a, b) => b - a)
    .slice(0, 5);
}

function LeadReport({
  title,
  unit,
  timeScope,
  queries,
  total,
  accent,
  emptyDescription,
}: {
  title: string;
  unit: 'painting' | 'page';
  timeScope: StatsTimeScope;
  queries: DiamondQueries | ColoringQueries;
  total: number | undefined;
  accent?: 'primary' | 'teal';
  emptyDescription: string;
}) {
  const points =
    timeScope.kind === 'year'
      ? monthlyCompletionsToChartPoints(queries.monthly.data?.months ?? [], timeScope.year)
      : yearlyCompletionsToChartPoints(queries.yearly.data?.years ?? []);
  const chartQuery = timeScope.kind === 'year' ? queries.monthly : queries.yearly;
  const leadLabel = timeScope.kind === 'year' ? 'Completed this year' : 'Completed, all time';
  const leadTotal = timeScope.kind === 'year' ? total : queries.yearly.data?.total;

  const leadNumber = (
    <div className="space-y-3">
      <div>
        <p className="text-muted-foreground text-sm">{leadLabel}</p>
        {queries.summary.isLoading || queries.yearly.isLoading ? (
          <Skeleton className="mt-2 h-11 w-36" />
        ) : (
          <p className="text-foreground mt-1 flex flex-wrap items-baseline gap-2 text-4xl font-semibold tracking-tight tabular-nums">
            {formatStatsNumber(leadTotal)}
            <span className="text-muted-foreground text-base font-medium tracking-normal">
              {leadTotal === 1 ? unit : `${unit}s`}
            </span>
          </p>
        )}
      </div>
      {timeScope.kind === 'year' ? (
        <PriorYearsListLeft years={queries.yearly.data?.years ?? []} currentYear={timeScope.year} />
      ) : null}
    </div>
  );

  const chart = chartQuery.isError ? (
    <StatsInlineRetry
      title={`${title} chart did not load`}
      description="The rest of this report can stay visible while the chart retries."
      onRetry={() => retryAll([chartQuery])}
    />
  ) : (
    <LeadCompletionChart
      title={`${title} completion chart`}
      summary={
        timeScope.kind === 'year'
          ? `${title} has ${formatStatsNumber(leadTotal)} completions in ${timeScope.year}. Each point compares the month with the previous year.`
          : `${title} has ${formatStatsNumber(leadTotal)} all-time completions by year.`
      }
      points={points}
      scope={timeScope}
      isLoading={chartQuery.isLoading}
      emptyDescription={emptyDescription}
      accent={accent}
    />
  );

  return (
    <article className="border-border/60 border-b pb-6">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
        <div className="md:w-56 md:shrink-0 lg:w-64">{leadNumber}</div>
        <div className="min-w-0 flex-1">{chart}</div>
      </div>
    </article>
  );
}

function PriorYearsListLeft({
  years,
  currentYear,
}: {
  years: readonly { year: number; count: number }[];
  currentYear: number;
}) {
  const priorYears = years
    .filter(year => year.year < currentYear && year.count > 0)
    .slice()
    .sort((a, b) => b.year - a.year)
    .slice(0, 3);

  if (priorYears.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-muted-foreground text-xs">Prior years</p>
      <dl aria-label="Prior year totals" className="text-muted-foreground w-fit text-xs leading-6">
        {priorYears.map(year => (
          <div key={year.year} className="flex items-baseline justify-between gap-3">
            <dt className="font-mono tracking-[0.04em]">{year.year}</dt>
            <dd className="text-foreground font-semibold tabular-nums">
              {formatStatsNumber(year.count)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function DiamondRegion({
  queries,
  timeScope,
  isSeparated,
}: {
  queries: DiamondQueries;
  timeScope: StatsTimeScope;
  isSeparated?: boolean;
}) {
  const summary = queries.summary.data;
  const collection = queries.collection.data;
  const groups: MostRepresentedGroup[] = [
    {
      key: 'companies',
      label: 'Companies',
      group: topListGroup(collection?.topCompaniesGroup, collection?.topCompanies),
    },
    {
      key: 'artists',
      label: 'Artists',
      group: topListGroup(collection?.topArtistsGroup, collection?.topArtists),
    },
    {
      key: 'tags',
      label: 'Tags',
      group: topListGroup(collection?.topTagsGroup, collection?.topTags),
    },
    {
      key: 'sizes',
      label: 'Sizes',
      group: sizeGroup(collection),
    },
  ];

  return (
    <StatsCraftRegion id="diamond-stats-region" title="Diamond paintings" isSeparated={isSeparated}>
      <LeadReport
        title="Diamond paintings"
        unit="painting"
        timeScope={timeScope}
        queries={queries}
        total={summary?.metrics.completedThisYear}
        emptyDescription="Complete diamond painting kits to show your diamond painting history!"
      />
      <section className="border-border/60 border-t pt-6" aria-labelledby="diamond-stats-grid">
        <SectionHeading as="h3" id="diamond-stats-grid" className="mb-4">
          Library &amp; timing
        </SectionHeading>
        <div className="grid gap-6 md:grid-cols-2 md:gap-x-10 md:gap-y-6">
          {queries.summary.isError ? (
            <StatsInlineRetry
              title="Diamond library stats did not load"
              onRetry={() => retryAll([queries.summary])}
            />
          ) : (
            <StatsKeyValueColumn title="Library" unit="kits" isLoading={queries.summary.isLoading}>
              <StatsKeyValueRow
                label="Total kits"
                value={formatStatsNumber(summary?.metrics.totalKits)}
              />
              <StatsKeyValueRow
                label="Wishlist"
                value={formatStatsNumber(summary?.metrics.wishlistSize)}
              />
              <StatsKeyValueRow
                label="In stash"
                hint="arrived but not yet started"
                value={formatStatsNumber(summary?.metrics.inStash)}
              />
              <StatsKeyValueRow
                label={
                  <DefinitionTerm definition="Drills sorted and ready to start.">
                    Kitted up
                  </DefinitionTerm>
                }
                value={formatStatsNumber(summary?.statusBreakdown.kitted)}
              />
              <StatsKeyValueRow
                label="In progress"
                value={formatStatsNumber(summary?.metrics.inProgress)}
              />
              <StatsKeyValueRow
                label="On hold"
                value={formatStatsNumber(summary?.statusBreakdown.onhold)}
              />
              <StatsKeyValueRow
                label="Completed"
                hint={
                  timeScope.kind === 'year' ? `in ${timeScope.year}` : 'all-time, across every year'
                }
                value={formatStatsNumber(
                  timeScope.kind === 'year'
                    ? summary?.metrics.completedThisYear
                    : summary?.metrics.allTimeCompleted
                )}
              />
            </StatsKeyValueColumn>
          )}
          {queries.times.isError ? (
            <StatsInlineRetry
              title="Diamond timing stats did not load"
              onRetry={() => retryAll([queries.times])}
            />
          ) : (
            <StatsKeyValueColumn
              title="Typical timing"
              unit="days"
              isLoading={queries.times.isLoading}
            >
              <StatsKeyValueRow
                label={
                  <DefinitionTerm definition="Average time from received date to first worked on.">
                    Average time in stash
                  </DefinitionTerm>
                }
                value={formatStatsDays(queries.times.data?.averageStashDwellDays)}
              />
              <StatsKeyValueRow
                label="Time to start"
                hint="purchase to first worked on"
                value={formatStatsDays(queries.times.data?.averageTimeToStartDays)}
              />
              <StatsKeyValueRow
                label="Time to finish"
                hint="first worked on to completed"
                value={formatStatsDays(queries.times.data?.averageCompletionDays)}
              />
              <StatsKeyValueRow
                label="Most common size"
                value={topLabel(sizeGroup(collection).items, '-')}
                valueClassName="max-w-44 text-sm whitespace-normal"
              />
              <StatsKeyValueRow
                label="Most common company"
                value={topLabel(collection?.topCompanies, '-')}
                valueClassName="max-w-44 text-sm whitespace-normal"
              />
              <StatsKeyValueRow
                label="Most common drill shape"
                value={topSplitLabel(collection?.drillShapeSplit, '-')}
                valueClassName="max-w-44 text-sm whitespace-normal"
              />
            </StatsKeyValueColumn>
          )}
        </div>
      </section>
      <MostRepresentedList
        title="Most represented (all time)"
        groups={groups}
        isLoading={queries.collection.isLoading}
        isError={queries.collection.isError}
        onRetry={() => retryAll([queries.collection])}
      />
    </StatsCraftRegion>
  );
}

function ColoringRegion({
  queries,
  timeScope,
  isSeparated,
}: {
  queries: ColoringQueries;
  timeScope: StatsTimeScope;
  isSeparated?: boolean;
}) {
  const summary = queries.summary.data;
  const collection = queries.collection.data;
  const finishedBooks =
    summary?.bookStatusBreakdown.completed ??
    collection?.bookStatusSplit.find(item => item.key === 'completed')?.count;
  const groups: MostRepresentedGroup[] = [
    {
      key: 'publishers',
      label: 'Publishers',
      group: topListGroup(collection?.topPublishersGroup, collection?.topPublishers),
    },
    {
      key: 'illustrators',
      label: 'Illustrators',
      group: topListGroup(collection?.topIllustratorsGroup, collection?.topIllustrators),
    },
    {
      key: 'mediums',
      label: 'Mediums',
      group: topListGroup(collection?.topMediumsGroup, collection?.topMediums),
    },
    {
      key: 'tags',
      label: 'Tags',
      group: topListGroup(collection?.topTagsGroup, collection?.topTags),
    },
  ];

  return (
    <StatsCraftRegion
      id="coloring-stats-region"
      title="Coloring"
      accent="teal"
      isSeparated={isSeparated}
    >
      <LeadReport
        title="Coloring"
        unit="page"
        timeScope={timeScope}
        queries={queries}
        total={summary?.metrics.completedPagesThisYear}
        accent="teal"
        emptyDescription="Complete coloring pages to show your coloring history!"
      />
      <section className="border-border/60 border-t pt-6" aria-labelledby="coloring-stats-grid">
        <SectionHeading as="h3" id="coloring-stats-grid" className="mb-4">
          Library &amp; timing
        </SectionHeading>
        <div className="grid gap-6 md:grid-cols-2 md:gap-x-10 md:gap-y-6">
          {queries.summary.isError ? (
            <StatsInlineRetry
              title="Coloring library stats did not load"
              onRetry={() => retryAll([queries.summary])}
            />
          ) : (
            <StatsKeyValueColumn title="Library" unit="books" isLoading={queries.summary.isLoading}>
              <StatsKeyValueRow
                label="Total books"
                value={formatStatsNumber(summary?.metrics.totalBooks)}
              />
              <StatsKeyValueRow
                label="Active right now"
                value={formatStatsNumber(summary?.bookStatusBreakdown.in_progress)}
              />
              <StatsKeyValueRow
                label="Active pages"
                value={formatStatsNumber(summary?.metrics.activePages)}
              />
              <StatsKeyValueRow label="Finished books" value={formatStatsNumber(finishedBooks)} />
              <StatsKeyValueRow
                label="Wishlist"
                value={formatStatsNumber(summary?.metrics.wishlistSize)}
              />
            </StatsKeyValueColumn>
          )}
          {queries.times.isError ? (
            <StatsInlineRetry
              title="Coloring timing stats did not load"
              onRetry={() => retryAll([queries.times])}
            />
          ) : (
            <StatsKeyValueColumn
              title="Typical timing"
              unit="days"
              isLoading={queries.times.isLoading}
            >
              <StatsKeyValueRow
                label="Average page completion time"
                value={formatStatsDays(queries.times.data?.averagePageCompletionDays)}
              />
              <StatsKeyValueRow
                label="Average time before starting the first page"
                value={formatStatsDays(queries.times.data?.averageBookDwellDays)}
              />
              <StatsKeyValueRow
                label="Most common publisher"
                value={topLabel(collection?.topPublishers, '-')}
                valueClassName="max-w-44 text-sm whitespace-normal"
              />
              <StatsKeyValueRow
                label="Most common medium"
                value={topLabel(collection?.topMediums, '-')}
                valueClassName="max-w-44 text-sm whitespace-normal"
              />
            </StatsKeyValueColumn>
          )}
        </div>
      </section>
      <MostRepresentedList
        title="Most represented (all time)"
        groups={groups}
        isLoading={queries.collection.isLoading}
        isError={queries.collection.isError}
        onRetry={() => retryAll([queries.collection])}
      />
    </StatsCraftRegion>
  );
}

export default function Stats() {
  useAppReady();
  const { user } = useAuth();
  const {
    diamond_painting: canUseDiamond,
    coloring_books: canUseColoring,
    isLoading: verticalsLoading,
  } = useEnabledVerticals(user?.id);
  const [scope, setScope] = useState<CraftScope>('all');
  const [timeScope, setTimeScope] = useState<StatsTimeScope>({ kind: 'year', year: currentYear });
  const selectedYear = timeScope.kind === 'year' ? timeScope.year : currentYear;
  const visibleScope = getFallbackScope(scope, canUseDiamond, canUseColoring);

  useEffect(() => {
    if (!verticalsLoading) {
      setScope(previous => getFallbackScope(previous, canUseDiamond, canUseColoring));
    }
  }, [canUseColoring, canUseDiamond, verticalsLoading]);

  const wantsDiamond = visibleScope === 'all' || visibleScope === 'diamond';
  const wantsColoring = visibleScope === 'all' || visibleScope === 'coloring';
  const diamondEnabled = !verticalsLoading && canUseDiamond && wantsDiamond;
  const coloringEnabled = !verticalsLoading && canUseColoring && wantsColoring;
  const isYearScope = timeScope.kind === 'year';

  const diamondQueries: DiamondQueries = {
    summary: useStatsSummary(selectedYear, { enabled: diamondEnabled }),
    monthly: useCompletionsByMonth(selectedYear, { enabled: diamondEnabled && isYearScope }),
    yearly: useCompletionsYearly({ enabled: diamondEnabled }),
    times: useCompletionTimeStats({ enabled: diamondEnabled }),
    collection: useCollectionStats({ enabled: diamondEnabled }),
  };
  const coloringQueries: ColoringQueries = {
    summary: useColoringStatsSummary(selectedYear, { enabled: coloringEnabled }),
    monthly: useColoringCompletionsByMonth(selectedYear, {
      enabled: coloringEnabled && isYearScope,
    }),
    yearly: useColoringCompletionsYearly({ enabled: coloringEnabled }),
    times: useColoringCompletionTimeStats({ enabled: coloringEnabled }),
    collection: useColoringCollectionStats({ enabled: coloringEnabled }),
  };

  const years = useMemo(
    () => yearsForControl(diamondQueries.yearly.data, coloringQueries.yearly.data, timeScope),
    [coloringQueries.yearly.data, diamondQueries.yearly.data, timeScope]
  );
  const showDiamond = visibleScope === 'all' || visibleScope === 'diamond';
  const showColoring = visibleScope === 'all' || visibleScope === 'coloring';

  return (
    <MainLayout currentPage="Stats">
      <div className="container mx-auto px-4 py-6">
        <header className="mb-6">
          <h1 className="text-foreground font-handwritten text-3xl leading-tight tracking-tight md:text-4xl">
            Stats
          </h1>
        </header>

        <GlassPanel className="space-y-6 p-4 sm:p-5 md:space-y-8 md:p-6">
          <div className="mb-2 flex flex-col gap-3 md:mb-4 lg:flex-row lg:items-start lg:justify-between">
            {verticalsLoading ? (
              <Skeleton className="h-11 w-full sm:w-[420px]" />
            ) : (
              <StatsScopeControl
                value={visibleScope}
                onValueChange={setScope}
                canUseDiamond={canUseDiamond}
                canUseColoring={canUseColoring}
              />
            )}
            <StatsTimeScopeControl years={years} value={timeScope} onValueChange={setTimeScope} />
          </div>

          {verticalsLoading ? (
            <StatsRegionSkeleton />
          ) : !canUseDiamond && !canUseColoring ? (
            <StatsEmptyState
              title="No craft verticals are enabled"
              description="Enable diamond painting or coloring in settings to see stats here."
            />
          ) : (
            <>
              {showDiamond ? (
                <DiamondRegion queries={diamondQueries} timeScope={timeScope} />
              ) : null}
              {showColoring ? (
                <ColoringRegion
                  queries={coloringQueries}
                  timeScope={timeScope}
                  isSeparated={showDiamond}
                />
              ) : null}
            </>
          )}
        </GlassPanel>
      </div>
    </MainLayout>
  );
}
