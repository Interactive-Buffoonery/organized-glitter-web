import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import SegmentedControl from '@/components/shared/SegmentedControl';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { cn } from '@/lib/utils';
import { formatStatsDays, formatStatsNumber } from '@/lib/utils';
import { getStatsChartMax } from '@/utils/stats';
import type { StatsChartPoint, StatsTimeScope, StatsTopListGroup } from '@/types/stats';

export type CraftScope = 'all' | 'diamond' | 'coloring';

function formatDelta(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  if (value === 0) return '0';
  return value > 0 ? `+${value}` : String(value);
}

interface StatsScopeControlProps {
  value: CraftScope;
  onValueChange: (value: CraftScope) => void;
  canUseDiamond: boolean;
  canUseColoring: boolean;
}

export function StatsScopeControl({
  value,
  onValueChange,
  canUseDiamond,
  canUseColoring,
}: StatsScopeControlProps) {
  const options = [
    canUseDiamond && canUseColoring
      ? {
          value: 'all' as const,
          label: 'All crafts',
        }
      : null,
    canUseDiamond
      ? {
          value: 'diamond' as const,
          label: 'Diamond paintings',
        }
      : null,
    canUseColoring
      ? {
          value: 'coloring' as const,
          label: 'Coloring',
        }
      : null,
  ].filter(option => option !== null);

  return (
    <SegmentedControl
      variant="glass"
      ariaLabel="Craft scope"
      value={value}
      onValueChange={onValueChange}
      className="w-full flex-wrap gap-1 sm:w-auto sm:min-w-[420px]"
      buttonClassName="flex-auto whitespace-nowrap"
      options={options}
    />
  );
}

interface StatsTimeScopeControlProps {
  years: readonly number[];
  value: StatsTimeScope;
  onValueChange: (scope: StatsTimeScope) => void;
}

export function StatsTimeScopeControl({ years, value, onValueChange }: StatsTimeScopeControlProps) {
  const timeValue = value.kind === 'year' ? String(value.year) : 'all-time';
  const options = [
    ...years.map(year => ({
      value: String(year),
      label: String(year),
    })),
    {
      value: 'all-time',
      label: 'All time',
    },
  ];

  return (
    <SegmentedControl
      variant="glass"
      ariaLabel="Time scope"
      value={timeValue}
      onValueChange={next => {
        onValueChange(
          next === 'all-time' ? { kind: 'all-time' } : { kind: 'year', year: Number(next) }
        );
      }}
      className="w-full sm:w-auto"
      buttonClassName="px-3 text-xs sm:px-4 sm:text-sm"
      options={options}
    />
  );
}

interface StatsInlineRetryProps {
  title: string;
  onRetry: () => void;
  description?: string;
  className?: string;
}

export function StatsInlineRetry({
  title,
  description,
  onRetry,
  className,
}: StatsInlineRetryProps) {
  return (
    <div
      className={cn(
        'border-destructive/25 bg-destructive/5 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div>
        <p className="text-foreground text-sm font-semibold">{title}</p>
        {description ? <p className="text-muted-foreground mt-1 text-sm">{description}</p> : null}
      </div>
      <Button type="button" variant="glass" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

export function StatsRegionSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-[280px] w-full rounded-xl" />
      <div className="grid gap-5 md:grid-cols-2">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    </div>
  );
}

interface StatsEmptyStateProps {
  title: string;
  description?: string;
}

export function StatsEmptyState({ title, description }: StatsEmptyStateProps) {
  return (
    <div className="border-border/70 bg-background/35 rounded-xl border border-dashed p-5">
      <p className="text-foreground text-sm font-semibold">{title}</p>
      {description ? <p className="text-muted-foreground mt-1 text-sm">{description}</p> : null}
    </div>
  );
}

interface StatsCraftRegionProps {
  id: string;
  title: string;
  accent?: 'primary' | 'teal';
  children: ReactNode;
  isSeparated?: boolean;
}

export function StatsCraftRegion({
  id,
  title,
  accent = 'primary',
  children,
  isSeparated,
}: StatsCraftRegionProps) {
  return (
    <section
      aria-labelledby={id}
      className={cn('space-y-5', isSeparated && 'border-border/60 border-t pt-6 md:pt-8')}
    >
      <h2
        id={id}
        className="text-foreground inline-flex items-center gap-2.5 text-sm font-semibold tracking-tight"
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-block h-[2px] w-[22px] rounded-sm',
            accent === 'teal' ? 'bg-aurora-teal' : 'bg-primary'
          )}
        />
        {title}
      </h2>
      {children}
    </section>
  );
}

interface LeadCompletionChartProps {
  title: string;
  summary: string;
  points: readonly StatsChartPoint[];
  scope: StatsTimeScope;
  isLoading?: boolean;
  emptyDescription: string;
  accent?: 'primary' | 'teal';
}

const CHART_DEFAULT_WIDTH = 720;
const CHART_HEIGHT = 260;
const CHART_PLOT_TOP = 28;
const CHART_BASELINE_Y = 215;
const CHART_POINT_HIT_RADIUS = 22;

function getChartTooltipTranslateX(activeIndex: number | null, pointCount: number): string {
  if (pointCount === 1) return '-50%';
  if (activeIndex === 0) return '0%';
  if (activeIndex === pointCount - 1) return '-100%';
  return '-50%';
}

function getChartHitTargetX(x: number, width: number): number {
  return Math.min(width - CHART_POINT_HIT_RADIUS, Math.max(CHART_POINT_HIT_RADIUS, x));
}

export function LeadCompletionChart({
  title,
  summary,
  points,
  scope,
  isLoading,
  emptyDescription,
  accent = 'primary',
}: LeadCompletionChartProps) {
  const chartId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<HTMLDivElement>(null);
  const pointRefs = useRef<Array<SVGCircleElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState<number>(CHART_DEFAULT_WIDTH);

  useEffect(() => {
    const node = svgRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 0) setMeasuredWidth(width);
      }
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const width = measuredWidth;
  const baselineY = CHART_BASELINE_Y;
  const plotTop = CHART_PLOT_TOP;
  const plotHeight = baselineY - plotTop;
  const max = getStatsChartMax(points.map(point => point.count));
  const xStep = points.length > 1 ? width / (points.length - 1) : width;
  const coordinates = points.map((point, index) => {
    const x = points.length > 1 ? index * xStep : width / 2;
    const y = baselineY - (point.count / max) * plotHeight;
    return { x, y };
  });
  const linePath = coordinates
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
  const areaPath = coordinates.length
    ? `${linePath} L ${coordinates[coordinates.length - 1].x} ${baselineY} L ${coordinates[0].x} ${baselineY} Z`
    : '';
  const activePoint = activeIndex === null ? null : points[activeIndex];
  const activeCoordinate = activeIndex === null ? null : coordinates[activeIndex];
  const total = points.reduce((sum, point) => sum + point.count, 0);
  const strokeClass = accent === 'teal' ? 'stroke-aurora-teal' : 'stroke-primary';
  const fillClass = accent === 'teal' ? 'fill-aurora-teal' : 'fill-primary';
  const washFill =
    accent === 'teal' ? 'hsl(var(--aurora-teal) / 0.08)' : 'hsl(var(--primary) / 0.08)';
  const gridYs = [plotTop, plotTop + plotHeight * 0.33, plotTop + plotHeight * 0.66, baselineY];

  useEffect(() => {
    if (activeIndex === null) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setActiveIndex(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [activeIndex]);

  if (isLoading) {
    return <Skeleton className="h-[260px] w-full max-w-3xl rounded-xl md:h-[280px]" />;
  }

  if (points.length === 0 || total === 0) {
    return <StatsEmptyState title="No completions yet" description={emptyDescription} />;
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-3xl">
      <p id={`${chartId}-summary`} className="sr-only">
        {summary}
      </p>
      <div ref={svgRef} className="relative h-[220px] w-full md:h-[260px]">
        <svg
          role="group"
          aria-labelledby={`${chartId}-title ${chartId}-summary`}
          viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
          className="size-full overflow-visible"
        >
          <title id={`${chartId}-title`}>{title}</title>
          {gridYs.map((y, index) => (
            <line
              key={y}
              x1="0"
              x2={width}
              y1={y}
              y2={y}
              className={index === gridYs.length - 1 ? 'stroke-border' : 'stroke-border/60'}
              strokeWidth="1"
            />
          ))}
          {areaPath ? <path d={areaPath} fill={washFill} /> : null}
          <path
            d={linePath}
            fill="none"
            className={strokeClass}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.map((point, index) => {
            const coordinate = coordinates[index];
            const isActive = activeIndex === index;
            const isFocused = focusedIndex === index;
            const hitTargetX = getChartHitTargetX(coordinate.x, width);
            return (
              <g key={point.key}>
                {isActive ? (
                  <circle
                    cx={coordinate.x}
                    cy={coordinate.y}
                    r={13}
                    className={cn(fillClass, 'opacity-20')}
                  />
                ) : null}
                {isFocused ? (
                  <circle
                    aria-hidden="true"
                    data-chart-focus-ring
                    cx={coordinate.x}
                    cy={coordinate.y}
                    r={10}
                    fill="none"
                    className="stroke-ring pointer-events-none"
                    strokeWidth={3}
                  />
                ) : null}
                <circle
                  aria-hidden="true"
                  data-chart-point-dot
                  cx={coordinate.x}
                  cy={coordinate.y}
                  r={isActive ? 6 : 3.5}
                  className={cn(fillClass, 'pointer-events-none')}
                />
                <circle
                  ref={node => {
                    pointRefs.current[index] = node;
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={chartPointLabel(point, scope)}
                  aria-expanded={isActive}
                  cx={hitTargetX}
                  cy={coordinate.y}
                  r={CHART_POINT_HIT_RADIUS}
                  fill="transparent"
                  pointerEvents="all"
                  className="cursor-pointer outline-none"
                  onFocus={() => {
                    setFocusedIndex(index);
                    setActiveIndex(index);
                  }}
                  onBlur={() => {
                    setFocusedIndex(null);
                    setActiveIndex(null);
                  }}
                  onClick={() => setActiveIndex(index)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setActiveIndex(index);
                    }
                    if (event.key === 'ArrowRight') {
                      event.preventDefault();
                      const targetIndex = Math.min(points.length - 1, index + 1);
                      setActiveIndex(targetIndex);
                      pointRefs.current[targetIndex]?.focus();
                    }
                    if (event.key === 'ArrowLeft') {
                      event.preventDefault();
                      const targetIndex = Math.max(0, index - 1);
                      setActiveIndex(targetIndex);
                      pointRefs.current[targetIndex]?.focus();
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setActiveIndex(null);
                    }
                  }}
                />
              </g>
            );
          })}
        </svg>
        {activePoint && activeCoordinate ? (
          <div
            role="tooltip"
            aria-live="polite"
            className="border-border bg-popover text-popover-foreground pointer-events-none absolute min-w-40 rounded-xl border px-3 py-2 text-xs shadow-lg"
            style={{
              left: `${(activeCoordinate.x / width) * 100}%`,
              top: `${(activeCoordinate.y / CHART_HEIGHT) * 100}%`,
              transform: `translate(${getChartTooltipTranslateX(activeIndex, points.length)}, calc(-100% - 12px))`,
            }}
          >
            <p className="font-semibold">{activePoint.label}</p>
            <div className="text-muted-foreground mt-1 space-y-0.5">
              <div className="flex justify-between gap-4">
                <span>Completed</span>
                <span className="text-foreground font-semibold tabular-nums">
                  {formatStatsNumber(activePoint.count)}
                </span>
              </div>
              {scope.kind === 'year' ? (
                <>
                  <div className="flex justify-between gap-4">
                    <span>vs. previous year</span>
                    <span className="text-foreground font-semibold tabular-nums">
                      {formatDelta(activePoint.comparisonDelta)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Avg. finish time</span>
                    <span className="text-foreground font-semibold tabular-nums">
                      {formatStatsDays(activePoint.averageDays)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between gap-4">
                  <span>Cumulative</span>
                  <span className="text-foreground font-semibold tabular-nums">
                    {formatStatsNumber(activePoint.cumulativeCount)}
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
      <div
        aria-hidden="true"
        className="text-muted-foreground relative mt-2 h-4 font-mono text-[0.65rem] tracking-[0.04em]"
      >
        {points.map((point, index) => {
          const coordinate = coordinates[index];
          const leftPercent = (coordinate.x / width) * 100;
          return (
            <span
              key={point.key}
              className={cn(
                'absolute top-0 -translate-x-1/2 whitespace-nowrap',
                scope.kind === 'year' && index % 2 === 1 && 'max-[540px]:hidden'
              )}
              style={{ left: `${leftPercent}%` }}
            >
              {point.label}
            </span>
          );
        })}
      </div>
      <StatsDataTable
        caption={title}
        headers={
          scope.kind === 'year'
            ? [
                'Month',
                'Completed',
                'Previous year',
                'Change from previous year',
                'Average finish time',
              ]
            : ['Year', 'Completed', 'Cumulative completed']
        }
        rows={
          scope.kind === 'year'
            ? points.map(point => [
                point.label,
                formatStatsNumber(point.count),
                formatStatsNumber(point.count - (point.comparisonDelta ?? 0)),
                formatDelta(point.comparisonDelta),
                formatStatsDays(point.averageDays),
              ])
            : points.map(point => [
                point.label,
                formatStatsNumber(point.count),
                formatStatsNumber(point.cumulativeCount),
              ])
        }
      />
    </div>
  );
}

function chartPointLabel(point: StatsChartPoint, scope: StatsTimeScope): string {
  if (scope.kind === 'all-time') {
    return `${point.label}: ${formatStatsNumber(point.count)} completed, ${formatStatsNumber(point.cumulativeCount)} cumulative`;
  }

  return `${point.label}: ${formatStatsNumber(point.count)} completed, ${formatDelta(point.comparisonDelta)} from previous year, average finish time ${formatStatsDays(point.averageDays)}`;
}

interface StatsKeyValueColumnProps {
  title: string;
  unit?: string;
  children: ReactNode;
  isLoading?: boolean;
}

export function StatsKeyValueColumn({
  title,
  unit,
  children,
  isLoading,
}: StatsKeyValueColumnProps) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-foreground text-sm font-semibold">{title}</h3>
        {unit ? <span className="text-muted-foreground text-xs">{unit}</span> : null}
      </div>
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
      ) : (
        <dl className="divide-border/60 divide-y">{children}</dl>
      )}
    </section>
  );
}

interface StatsKeyValueRowProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  valueClassName?: string;
}

export function StatsKeyValueRow({ label, value, hint, valueClassName }: StatsKeyValueRowProps) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 py-2.5">
      <dt className="text-foreground/85 min-w-0 text-sm leading-snug">
        {label}
        {hint ? <span className="text-muted-foreground mt-1 block text-xs">{hint}</span> : null}
      </dt>
      <dd
        className={cn(
          'text-foreground text-right text-base font-semibold tabular-nums',
          valueClassName
        )}
      >
        {value}
      </dd>
    </div>
  );
}

interface DefinitionTermProps {
  children: ReactNode;
  definition: string;
}

export function DefinitionTerm({ children, definition }: DefinitionTermProps) {
  const [isOpen, setIsOpen] = useState(false);
  const id = useId();

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-describedby={isOpen ? id : undefined}
        className="decoration-primary/45 hover:text-foreground focus-visible:ring-ring rounded-sm underline decoration-dotted underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
        onClick={() => setIsOpen(current => !current)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
      >
        {children}
      </button>
      <span
        id={id}
        role="tooltip"
        aria-live="polite"
        className={cn(
          'border-border bg-popover text-popover-foreground absolute bottom-full left-0 z-20 mb-2 w-56 rounded-lg border px-3 py-2 text-left text-xs shadow-lg',
          !isOpen && 'sr-only'
        )}
      >
        {definition}
      </span>
    </span>
  );
}

export interface MostRepresentedGroup {
  key: string;
  label: string;
  group: StatsTopListGroup;
}

interface MostRepresentedSwitcherProps {
  groups: readonly MostRepresentedGroup[];
  value: string;
  onValueChange: (value: string) => void;
}

function MostRepresentedSwitcher({ groups, value, onValueChange }: MostRepresentedSwitcherProps) {
  return (
    <div
      className="bg-muted inline-flex flex-wrap gap-1 rounded-lg p-1"
      aria-label="Most represented group"
    >
      {groups.map(group => (
        <button
          key={group.key}
          type="button"
          aria-pressed={value === group.key}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            value === group.key
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => onValueChange(group.key)}
        >
          {group.label}
        </button>
      ))}
    </div>
  );
}

interface MostRepresentedListProps {
  title: string;
  groups: readonly MostRepresentedGroup[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry: () => void;
}

export function MostRepresentedList({
  title,
  groups,
  isLoading,
  isError,
  onRetry,
}: MostRepresentedListProps) {
  const [activeKey, setActiveKey] = useState(groups[0]?.key ?? '');
  const activeGroup = useMemo(
    () => groups.find(group => group.key === activeKey) ?? groups[0],
    [activeKey, groups]
  );

  useEffect(() => {
    if (!groups.some(group => group.key === activeKey)) {
      setActiveKey(groups[0]?.key ?? '');
    }
  }, [activeKey, groups]);

  if (isError) {
    return (
      <StatsInlineRetry
        title={`${title} did not load`}
        description="Retry this list without replacing the chart."
        onRetry={onRetry}
      />
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-foreground text-sm font-semibold">{title}</h3>
        <MostRepresentedSwitcher
          groups={groups}
          value={activeGroup?.key ?? ''}
          onValueChange={setActiveKey}
        />
      </div>
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
      ) : activeGroup ? (
        <MostRepresentedRows label={activeGroup.label} group={activeGroup.group} />
      ) : (
        <StatsEmptyState title="No represented data yet" />
      )}
    </section>
  );
}

function MostRepresentedRows({ label, group }: { label: string; group: StatsTopListGroup }) {
  const rows = [
    ...group.items.filter(item => item.count > 0),
    ...(group.otherCount > 0 ? [{ id: 'other', label: 'Other', count: group.otherCount }] : []),
  ];
  const max = getStatsChartMax(rows.map(row => row.count));

  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No {label.toLowerCase()} data yet.</p>;
  }

  return (
    <>
      <ol className="divide-border/60 divide-y">
        {rows.map(row => (
          <li
            key={row.id}
            className="grid grid-cols-[minmax(0,1fr)_minmax(120px,36%)_auto] items-center gap-3 py-2.5 text-sm"
          >
            <span className="text-foreground min-w-0 truncate">{row.label}</span>
            <span className="bg-muted h-1.5 overflow-hidden rounded-full" aria-hidden="true">
              <span
                className={cn(
                  'block h-full rounded-full',
                  row.id === 'other' ? 'bg-primary/45' : 'bg-primary'
                )}
                style={{ width: `${Math.max(6, (row.count / max) * 100)}%` }}
              />
            </span>
            <span className="text-foreground min-w-8 text-right font-semibold tabular-nums">
              {formatStatsNumber(row.count)}
            </span>
          </li>
        ))}
      </ol>
      <StatsDataTable
        caption={`Most represented ${label}`}
        headers={['Rank', 'Name', 'Count', 'Share of total']}
        rows={rows.map((row, index) => [
          String(index + 1),
          row.label,
          formatStatsNumber(row.count),
          group.total > 0 ? `${Math.round((row.count / group.total) * 100)}%` : '-',
        ])}
      />
    </>
  );
}

interface StatsDataTableProps {
  caption: string;
  headers: readonly string[];
  rows: readonly (readonly ReactNode[])[];
}

function StatsDataTable({ caption, headers, rows }: StatsDataTableProps) {
  return (
    <VisuallyHidden asChild>
      <div>
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              {headers.map(header => (
                <th key={header} scope="col">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) =>
                  cellIndex === 0 ? (
                    <th key={cellIndex} scope="row">
                      {cell}
                    </th>
                  ) : (
                    <td key={cellIndex}>{cell}</td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </VisuallyHidden>
  );
}
