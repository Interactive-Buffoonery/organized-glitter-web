import type { ProjectStatus } from '@/types/project-status';
import type {
  ColoringBooksStatusOptions,
  ColoringPagesStatusOptions,
} from '@/types/pocketbase.types';

type StatsMetricKey =
  | 'totalKits'
  | 'completedThisYear'
  | 'inProgress'
  | 'inStash'
  | 'allTimeCompleted'
  | 'wishlistSize';

type StatsSummaryMetrics = Record<StatsMetricKey, number>;

export type StatsStatusBreakdown = Record<ProjectStatus, number>;

export interface StatsSummaryResponse {
  generatedAt: string;
  year: number;
  metrics: StatsSummaryMetrics;
  statusBreakdown: StatsStatusBreakdown;
}

export type StatsTimeScope = { kind: 'year'; year: number } | { kind: 'all-time' };

export interface StatsChartPoint {
  key: string;
  label: string;
  count: number;
  comparisonLabel?: string;
  comparisonDelta?: number | null;
  averageDays?: number | null;
  cumulativeCount?: number;
}

export interface MonthlyCompletionCount {
  month: number;
  label: string;
  count: number;
  previousYearCount: number;
  previousYearDelta: number;
  averageCompletionDays: number | null;
}

export interface CompletionsByMonthResponse {
  generatedAt: string;
  year: number;
  total: number;
  months: MonthlyCompletionCount[];
}

export interface YearlyCompletionCount {
  year: number;
  count: number;
  cumulativeCount: number;
}

export interface CompletionsYearlyResponse {
  generatedAt: string;
  total: number;
  years: YearlyCompletionCount[];
}

interface StatsProjectSummary {
  id: string;
  title: string;
  dateStarted: string | null;
  dateCompleted: string | null;
}

interface CompletionTimeProject extends StatsProjectSummary {
  days: number;
}

interface ProductiveMonth {
  year: number;
  month: number;
  label: string;
  count: number;
}

export interface CompletionTimeStatsResponse {
  generatedAt: string;
  averageCompletionDays: number | null;
  averageStashDwellDays: number | null;
  averageTimeToStartDays: number | null;
  fastestCompletion: CompletionTimeProject | null;
  slowestCompletion: CompletionTimeProject | null;
  mostProductiveMonth: ProductiveMonth | null;
}

export interface StatsTopListItem {
  id: string;
  label: string;
  count: number;
}

export interface StatsTopListGroup {
  total: number;
  items: StatsTopListItem[];
  otherCount: number;
}

export interface StatsSplitItem {
  key: string;
  label: string;
  count: number;
}

export type StatsSizeBucketKey = 'mini' | 'small' | 'medium' | 'large' | 'huge' | 'unknown';

export interface StatsSizeBucket {
  key: StatsSizeBucketKey;
  label: string;
  count: number;
}

export interface CollectionStatsResponse {
  generatedAt: string;
  topCompanies: StatsTopListItem[];
  topCompaniesGroup: StatsTopListGroup;
  topArtists: StatsTopListItem[];
  topArtistsGroup: StatsTopListGroup;
  topTags: StatsTopListItem[];
  topTagsGroup: StatsTopListGroup;
  drillShapeSplit: StatsSplitItem[];
  kitCategorySplit: StatsSplitItem[];
  sizeBuckets: StatsSizeBucket[];
}

type ColoringStatsMetricKey =
  | 'totalBooks'
  | 'completedPagesThisYear'
  | 'activePages'
  | 'inStash'
  | 'allTimeCompletedPages'
  | 'wishlistSize';

type ColoringStatsSummaryMetrics = Record<ColoringStatsMetricKey, number>;

export type ColoringBookStatusBreakdown = Record<ColoringBooksStatusOptions, number>;

export type ColoringPageStatusBreakdown = Record<ColoringPagesStatusOptions, number>;

export interface ColoringStatsSummaryResponse {
  generatedAt: string;
  year: number;
  metrics: ColoringStatsSummaryMetrics;
  bookStatusBreakdown: ColoringBookStatusBreakdown;
  pageStatusBreakdown: ColoringPageStatusBreakdown;
}

interface ColoringCompletionTimeProject {
  id: string;
  bookId: string;
  bookTitle: string;
  title: string;
  pageNumber: number;
  startedAt: string | null;
  completedAt: string | null;
  days: number;
}

export interface ColoringCompletionTimeStatsResponse {
  generatedAt: string;
  averagePageCompletionDays: number | null;
  averageBookDwellDays: number | null;
  fastestPageCompletion: ColoringCompletionTimeProject | null;
  slowestPageCompletion: ColoringCompletionTimeProject | null;
  mostProductiveMonth: ProductiveMonth | null;
}

export type ColoringCompletionBucketKey = 'not_started' | 'started' | 'halfway' | 'completed';

export interface ColoringCompletionBucket {
  key: ColoringCompletionBucketKey;
  label: string;
  count: number;
}

export interface ColoringCollectionStatsResponse {
  generatedAt: string;
  topPublishers: StatsTopListItem[];
  topPublishersGroup: StatsTopListGroup;
  topIllustrators: StatsTopListItem[];
  topIllustratorsGroup: StatsTopListGroup;
  topTags: StatsTopListItem[];
  topTagsGroup: StatsTopListGroup;
  topMediums: StatsTopListItem[];
  topMediumsGroup: StatsTopListGroup;
  bookStatusSplit: StatsSplitItem[];
  pageStatusSplit: StatsSplitItem[];
  completionBuckets: ColoringCompletionBucket[];
}

interface MonthInReviewProject {
  id: string;
  title: string;
  date: string;
  company: string | null;
  artist: string | null;
}

interface MonthInReviewProgressNote {
  id: string;
  projectId: string;
  projectTitle: string;
  date: string;
  content: string;
  hasImage: boolean;
}

export interface MonthInReviewResponse {
  generatedAt: string;
  year: number;
  month: number;
  label: string;
  completedKits: MonthInReviewProject[];
  progressNotes: MonthInReviewProgressNote[];
  newAdditions: MonthInReviewProject[];
}
