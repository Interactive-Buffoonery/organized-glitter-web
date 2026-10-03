import { describe, expect, it } from 'vitest';

import {
  getStatsChartMax,
  monthlyCompletionsToChartPoints,
  normalizeTopListGroup,
  yearlyCompletionsToChartPoints,
} from '@/utils/stats';

describe('stats runtime helpers', () => {
  it('normalizes monthly completions into chart points with prior-year deltas', () => {
    expect(
      monthlyCompletionsToChartPoints(
        [
          {
            month: 1,
            label: 'Jan',
            count: 4,
            previousYearCount: 2,
            previousYearDelta: 2,
            averageCompletionDays: 5.5,
          },
          {
            month: 2,
            label: 'Feb',
            count: 0,
            previousYearCount: 3,
            previousYearDelta: -3,
            averageCompletionDays: null,
          },
        ],
        2026
      )
    ).toEqual([
      {
        key: '1',
        label: 'Jan',
        count: 4,
        comparisonLabel: 'Jan 2025',
        comparisonDelta: 2,
        averageDays: 5.5,
      },
      {
        key: '2',
        label: 'Feb',
        count: 0,
        comparisonLabel: 'Feb 2025',
        comparisonDelta: -3,
        averageDays: null,
      },
    ]);
  });

  it('normalizes all-time yearly completions into ascending chart points', () => {
    expect(
      yearlyCompletionsToChartPoints([
        { year: 2026, count: 3, cumulativeCount: 8 },
        { year: 2024, count: 5, cumulativeCount: 5 },
      ])
    ).toEqual([
      { key: '2024', label: '2024', count: 5, cumulativeCount: 5 },
      { key: '2026', label: '2026', count: 3, cumulativeCount: 8 },
    ]);
  });

  it('calculates top-list other counts from server-backed totals', () => {
    const items = [
      { id: 'a', label: 'A', count: 4 },
      { id: 'b', label: 'B', count: 2 },
    ];

    expect(normalizeTopListGroup(items, 10)).toEqual({
      total: 10,
      items,
      otherCount: 4,
    });
    expect(normalizeTopListGroup([{ id: 'a', label: 'A', count: 4 }], 2).otherCount).toBe(0);
    expect(normalizeTopListGroup([], Number.POSITIVE_INFINITY)).toEqual({
      total: 0,
      items: [],
      otherCount: 0,
    });
  });

  it('keeps chart scaling stable for all-zero and mixed values', () => {
    expect(getStatsChartMax([])).toBe(1);
    expect(getStatsChartMax([0, 0, 0])).toBe(1);
    expect(getStatsChartMax([0, 4, 2])).toBe(4);
    expect(getStatsChartMax([0, 0], 12)).toBe(12);
  });
});
