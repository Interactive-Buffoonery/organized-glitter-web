import type {
  MonthlyCompletionCount,
  StatsChartPoint,
  StatsTopListGroup,
  StatsTopListItem,
  YearlyCompletionCount,
} from '@/types/stats';

export function getStatsChartMax(values: readonly number[], fallback = 1): number {
  const max = Math.max(0, ...values);
  return max > 0 ? max : fallback;
}

export function monthlyCompletionsToChartPoints(
  months: readonly MonthlyCompletionCount[],
  year: number
): StatsChartPoint[] {
  return months.map(month => ({
    key: String(month.month),
    label: month.label,
    count: month.count,
    comparisonLabel: `${month.label} ${year - 1}`,
    comparisonDelta: month.previousYearDelta,
    averageDays: month.averageCompletionDays,
  }));
}

export function yearlyCompletionsToChartPoints(
  years: readonly YearlyCompletionCount[]
): StatsChartPoint[] {
  return years
    .slice()
    .sort((a, b) => a.year - b.year)
    .map(year => ({
      key: String(year.year),
      label: String(year.year),
      count: year.count,
      cumulativeCount: year.cumulativeCount,
    }));
}

export function normalizeTopListGroup(
  items: readonly StatsTopListItem[],
  total: number
): StatsTopListGroup {
  const normalizedTotal = Math.max(0, Number.isFinite(total) ? total : 0);
  const visibleTotal = items.reduce((sum, item) => sum + item.count, 0);

  return {
    total: normalizedTotal,
    items: [...items],
    otherCount: Math.max(0, normalizedTotal - visibleTotal),
  };
}
