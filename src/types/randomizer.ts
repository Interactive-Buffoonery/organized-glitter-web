export type RandomizerMode = 'diamond' | 'coloring-book' | 'coloring-page';

export type RandomizerTargetType = 'diamond_project' | 'coloring_book' | 'coloring_page';

type RandomizerOwnership = 'owned' | 'wishlist' | 'all';

export interface RandomizerTarget {
  id: string;
  mode: RandomizerMode;
  targetType: RandomizerTargetType;
  title: string;
  subtitle: string;
  imageUrl?: string;
  href: string;
  statusLabel: string;
  selectedMetadata: Record<string, unknown>;
  width?: number;
  height?: number;
  totalDiamonds?: number;
}

export interface RandomizerEligibility {
  diamondStatuses: string[];
  bookStatuses: string[];
  pageStatuses: string[];
  ownership: RandomizerOwnership;
}

export type RandomizerSection =
  | { kind?: 'size'; widthCm: number; heightCm: number; estimatedDiamonds?: number }
  | { kind: 'number'; number: number; candidates: number[] };

export interface RandomizerSpinMetadata {
  version: 1;
  mode: RandomizerMode;
  target: {
    id: string;
    targetType: RandomizerTargetType;
    title: string;
    subtitle: string;
    href: string;
  };
  eligibility: RandomizerEligibility;
  selectedTargetIds: string[];
  selectedTargets: Array<{
    id: string;
    targetType: RandomizerTargetType;
    title: string;
    subtitle: string;
  }>;
  section?: RandomizerSection;
}

export type RandomizerNextUpTarget = {
  id: string;
  mode: RandomizerMode;
  targetType: RandomizerTargetType;
  title: string;
  subtitle: string;
  href: string;
  savedAt: string;
};

export type RandomizerNextUpPreferences = {
  version: 1;
  targets: Partial<Record<RandomizerMode, RandomizerNextUpTarget>>;
};

export const DEFAULT_RANDOMIZER_ELIGIBILITY: RandomizerEligibility = {
  diamondStatuses: ['progress'],
  bookStatuses: ['in_progress'],
  pageStatuses: ['palette_chosen', 'in_progress'],
  ownership: 'owned',
};

export const DEFAULT_RANDOMIZER_NEXT_UP: RandomizerNextUpPreferences = {
  version: 1,
  targets: {},
};

export const RANDOMIZER_MODE_LABELS: Record<RandomizerMode, string> = {
  diamond: 'Diamond paintings',
  'coloring-book': 'Coloring books',
  'coloring-page': 'Coloring pages',
};

export const RANDOMIZER_TARGET_TYPE_LABELS: Record<RandomizerTargetType, string> = {
  diamond_project: 'Diamond painting',
  coloring_book: 'Coloring book',
  coloring_page: 'Coloring page',
};
