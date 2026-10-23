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
});
