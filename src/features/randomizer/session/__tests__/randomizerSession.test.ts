import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RANDOMIZER_ELIGIBILITY,
  type RandomizerEligibility,
  type RandomizerTarget,
} from '@/types/randomizer';
import {
  buildRandomizerUrl,
  buildSpinMetadata,
  parseRandomizerSearch,
  reconcileTargetPool,
  resolveTargetSelection,
} from '../randomizerSession';

const diamondTarget: RandomizerTarget = {
  id: 'diamond-one',
  mode: 'diamond',
  targetType: 'diamond_project',
  title: 'Aurora Wolves',
  subtitle: 'Moonlight Co.',
  href: '/projects/diamond-one',
  statusLabel: 'In progress',
  selectedMetadata: { company: 'Moonlight Co.' },
  width: 40,
};

const secondDiamondTarget: RandomizerTarget = {
  ...diamondTarget,
  id: 'diamond-two',
  title: 'Quiet Forest',
  href: '/projects/diamond-two',
};

const eligibility: RandomizerEligibility = {
  diamondStatuses: ['progress', 'onhold'],
  bookStatuses: ['in_progress'],
  pageStatuses: ['palette_chosen', 'in_progress'],
  ownership: 'owned',
};

describe('randomizer session URL state', () => {
  it('falls back from an unknown mode and missing eligibility filters', () => {
    expect(parseRandomizerSearch('?mode=unknown')).toEqual({
      mode: 'diamond',
      eligibility: DEFAULT_RANDOMIZER_ELIGIBILITY,
    });
  });

  it('round-trips explicitly unchecked status filters without restoring defaults', () => {
    const emptyEligibility = {
      ...DEFAULT_RANDOMIZER_ELIGIBILITY,
      diamondStatuses: [],
      bookStatuses: [],
      pageStatuses: [],
    };
    const url = buildRandomizerUrl('https://example.test/randomizer', {
      mode: 'diamond',
      eligibility: emptyEligibility,
      selectedTargetIds: new Set(),
      selection: 'none',
    });
    expect(parseRandomizerSearch(new URL(url).search).eligibility).toEqual(emptyEligibility);
  });

  it('reads coloring mode and comma-separated status filters without empty entries', () => {
    expect(
      parseRandomizerSearch(
        '?mode=coloring-page&diamondStatus=progress,%20onhold,%20&bookStatus=wishlist&pageStatus=not_started,in_progress'
      )
    ).toEqual({
      mode: 'coloring-page',
      eligibility: {
        diamondStatuses: ['progress', 'onhold'],
        bookStatuses: ['wishlist'],
        pageStatuses: ['not_started', 'in_progress'],
        ownership: 'owned',
      },
    });
  });

  it('keeps an explicit empty selection empty and distinguishes it from a missing selection', () => {
    const targets = [diamondTarget, secondDiamondTarget];

    expect(resolveTargetSelection('?items=none', 'diamond', targets)).toEqual({
      ids: new Set(),
      omitSelection: false,
    });
    expect(resolveTargetSelection('', 'diamond', targets)).toEqual({
      ids: new Set(['diamond-one', 'diamond-two']),
      omitSelection: true,
    });
  });

  it('honors legacy project IDs only in diamond mode and defaults when IDs are stale', () => {
    const targets = [diamondTarget, secondDiamondTarget];

    expect(resolveTargetSelection('?projects=diamond-two', 'diamond', targets)).toEqual({
      ids: new Set(['diamond-two']),
      omitSelection: false,
    });
    expect(resolveTargetSelection('?projects=diamond-two', 'coloring-book', targets)).toEqual({
      ids: new Set(['diamond-one', 'diamond-two']),
      omitSelection: true,
    });
    expect(resolveTargetSelection('?items=deleted-id', 'diamond', targets)).toEqual({
      ids: new Set(['diamond-one', 'diamond-two']),
      omitSelection: true,
    });
  });

  it('serializes explicit, default, and empty selections while removing legacy filters', () => {
    const currentHref = 'https://example.test/randomizer?projects=old&ownership=wishlist&keep=yes';
    const input = {
      mode: 'coloring-book' as const,
      eligibility,
      selectedTargetIds: new Set(['diamond-one', 'diamond-two']),
    };

    const explicit = new URL(buildRandomizerUrl(currentHref, { ...input, selection: 'explicit' }));
    expect(explicit.searchParams.get('mode')).toBe('coloring-book');
    expect(explicit.searchParams.get('items')).toBe('diamond-one,diamond-two');
    expect(explicit.searchParams.get('diamondStatus')).toBe('progress,onhold');
    expect(explicit.searchParams.get('bookStatus')).toBe('in_progress');
    expect(explicit.searchParams.get('pageStatus')).toBe('palette_chosen,in_progress');
    expect(explicit.searchParams.get('keep')).toBe('yes');
    expect(explicit.searchParams.has('projects')).toBe(false);
    expect(explicit.searchParams.has('ownership')).toBe(false);

    const defaultSelection = new URL(
      buildRandomizerUrl(currentHref, { ...input, mode: 'diamond', selection: 'default' })
    );
    expect(defaultSelection.searchParams.has('mode')).toBe(false);
    expect(defaultSelection.searchParams.has('items')).toBe(false);

    const empty = new URL(
      buildRandomizerUrl(currentHref, {
        ...input,
        selectedTargetIds: new Set(),
        selection: 'none',
      })
    );
    expect(empty.searchParams.get('items')).toBe('none');
  });
});

describe('randomizer target pool', () => {
  it('keeps the displayed order and references when a refetch only reorders targets', () => {
    const current = [diamondTarget, secondDiamondTarget];
    const refetched = [{ ...secondDiamondTarget }, { ...diamondTarget }];

    expect(reconcileTargetPool(current, refetched)).toBe(current);
  });

  it('refreshes target details while preserving the displayed order', () => {
    const current = [diamondTarget, secondDiamondTarget];
    const changed = { ...diamondTarget, title: 'New title', width: 50 };

    expect(reconcileTargetPool(current, [secondDiamondTarget, changed])).toEqual([
      changed,
      secondDiamondTarget,
    ]);
  });

  it('adopts new membership when a target is removed', () => {
    expect(
      reconcileTargetPool([diamondTarget, secondDiamondTarget], [secondDiamondTarget])
    ).toEqual([secondDiamondTarget]);
  });
});

describe('randomizer spin metadata', () => {
  it('captures the selected pool and target details without keeping mutable inputs', () => {
    const selectedTargetIds = ['diamond-one', 'diamond-two'];
    const selectedTargets = [diamondTarget, secondDiamondTarget];
    const inputEligibility: RandomizerEligibility = {
      ...eligibility,
      diamondStatuses: [...eligibility.diamondStatuses],
      bookStatuses: [...eligibility.bookStatuses],
      pageStatuses: [...eligibility.pageStatuses],
    };
    const metadata = buildSpinMetadata({
      target: diamondTarget,
      mode: 'diamond',
      eligibility: inputEligibility,
      selectedTargetIds,
      selectedTargets,
    });

    expect(metadata).toEqual({
      version: 1,
      mode: 'diamond',
      target: {
        id: 'diamond-one',
        targetType: 'diamond_project',
        title: 'Aurora Wolves',
        subtitle: 'Moonlight Co.',
        href: '/projects/diamond-one',
      },
      eligibility,
      selectedTargetIds: ['diamond-one', 'diamond-two'],
      selectedTargets: [
        {
          id: 'diamond-one',
          targetType: 'diamond_project',
          title: 'Aurora Wolves',
          subtitle: 'Moonlight Co.',
        },
        {
          id: 'diamond-two',
          targetType: 'diamond_project',
          title: 'Quiet Forest',
          subtitle: 'Moonlight Co.',
        },
      ],
      section: undefined,
    });

    selectedTargetIds.push('later');
    selectedTargets[0] = secondDiamondTarget;
    inputEligibility.diamondStatuses.push('completed');
    expect(metadata.selectedTargetIds).toEqual(['diamond-one', 'diamond-two']);
    expect(metadata.selectedTargets[0].id).toBe('diamond-one');
    expect(metadata.eligibility.diamondStatuses).toEqual(['progress', 'onhold']);
  });

  it('records scoped page eligibility and section as provided by the session', () => {
    const pageTarget: RandomizerTarget = {
      id: 'page-one',
      mode: 'coloring-page',
      targetType: 'coloring_page',
      title: 'Garden, page 1',
      subtitle: 'Garden',
      href: '/coloring/book-one/pages/page-one',
      statusLabel: 'Not started',
      selectedMetadata: { coloringBook: 'book-one', coloringPage: 'page-one' },
    };
    const pageEligibility: RandomizerEligibility = {
      ...eligibility,
      pageStatuses: ['not_started', 'palette_chosen', 'in_progress', 'on_hold'],
    };
    const section = { kind: 'number' as const, number: 4, candidates: [2, 4] };

    const metadata = buildSpinMetadata({
      target: pageTarget,
      mode: 'coloring-page',
      eligibility: pageEligibility,
      selectedTargetIds: ['page-one'],
      selectedTargets: [pageTarget],
      section,
    });
    expect(metadata).toMatchObject({
      mode: 'coloring-page',
      eligibility: pageEligibility,
      selectedTargetIds: ['page-one'],
      section: { kind: 'number', number: 4, candidates: [2, 4] },
    });
    section.candidates.push(8);
    pageEligibility.pageStatuses.push('completed');
    expect(metadata.section).toEqual({ kind: 'number', number: 4, candidates: [2, 4] });
    expect(metadata.eligibility.pageStatuses).toEqual([
      'not_started',
      'palette_chosen',
      'in_progress',
      'on_hold',
    ]);
  });
});
