import {
  DEFAULT_RANDOMIZER_ELIGIBILITY,
  type RandomizerEligibility,
  type RandomizerMode,
  type RandomizerSection,
  type RandomizerSpinMetadata,
  type RandomizerTarget,
} from '@/types/randomizer';

const VALID_MODES: RandomizerMode[] = ['diamond', 'coloring-book', 'coloring-page'];
const EMPTY_SELECTION_PARAM = 'none';

function readListParam(params: URLSearchParams, key: string, fallback: string[]): string[] {
  const value = params.get(key);
  if (value === null) return fallback;
  return value.split(',').flatMap(item => {
    const trimmed = item.trim();
    return trimmed ? [trimmed] : [];
  });
}

export function parseRandomizerSearch(search: string): {
  mode: RandomizerMode;
  eligibility: RandomizerEligibility;
} {
  const params = new URLSearchParams(search);
  const modeParam = params.get('mode');
  return {
    mode: VALID_MODES.includes(modeParam as RandomizerMode)
      ? (modeParam as RandomizerMode)
      : 'diamond',
    eligibility: {
      diamondStatuses: readListParam(
        params,
        'diamondStatus',
        DEFAULT_RANDOMIZER_ELIGIBILITY.diamondStatuses
      ),
      bookStatuses: readListParam(
        params,
        'bookStatus',
        DEFAULT_RANDOMIZER_ELIGIBILITY.bookStatuses
      ),
      pageStatuses: readListParam(
        params,
        'pageStatus',
        DEFAULT_RANDOMIZER_ELIGIBILITY.pageStatuses
      ),
      ownership: DEFAULT_RANDOMIZER_ELIGIBILITY.ownership,
    },
  };
}

export function resolveTargetSelection(
  search: string,
  mode: RandomizerMode,
  targets: RandomizerTarget[]
): { ids: Set<string>; omitSelection: boolean } {
  const params = new URLSearchParams(search);
  const itemParam = params.get('items');
  const selectedParam = itemParam ?? (mode === 'diamond' ? params.get('projects') : null);
  const selectionParamKey = itemParam !== null ? 'items' : mode === 'diamond' ? 'projects' : null;
  if (selectedParam === EMPTY_SELECTION_PARAM) {
    return { ids: new Set(), omitSelection: false };
  }

  const requestedIds =
    selectedParam && selectionParamKey ? readListParam(params, selectionParamKey, []) : [];
  const availableIds = new Set(targets.map(target => target.id));
  const validIds = requestedIds.filter(id => availableIds.has(id));
  if (validIds.length > 0) {
    return { ids: new Set(validIds), omitSelection: false };
  }
  return { ids: availableIds, omitSelection: true };
}

export function buildRandomizerUrl(
  currentHref: string,
  input: {
    mode: RandomizerMode;
    eligibility: RandomizerEligibility;
    selectedTargetIds: ReadonlySet<string>;
    selection: 'default' | 'explicit' | 'none';
  }
): string {
  const url = new URL(currentHref);
  if (input.mode === 'diamond') url.searchParams.delete('mode');
  else url.searchParams.set('mode', input.mode);

  url.searchParams.delete('projects');
  if (input.selection === 'default') url.searchParams.delete('items');
  else if (input.selection === 'none') url.searchParams.set('items', EMPTY_SELECTION_PARAM);
  else if (input.selectedTargetIds.size > 0)
    url.searchParams.set('items', [...input.selectedTargetIds].join(','));
  else url.searchParams.delete('items');

  url.searchParams.set('diamondStatus', input.eligibility.diamondStatuses.join(','));
  url.searchParams.set('bookStatus', input.eligibility.bookStatuses.join(','));
  url.searchParams.set('pageStatus', input.eligibility.pageStatuses.join(','));
  url.searchParams.delete('ownership');
  return url.toString();
}

function isSameTargetPool(current: RandomizerTarget[], next: RandomizerTarget[]): boolean {
  if (current.length !== next.length) return false;
  const nextTargetsById = new Map(next.map(target => [target.id, target]));
  return current.every(target => {
    const nextTarget = nextTargetsById.get(target.id);
    return (
      nextTarget != null &&
      target.mode === nextTarget.mode &&
      target.targetType === nextTarget.targetType &&
      target.title === nextTarget.title &&
      target.subtitle === nextTarget.subtitle &&
      target.statusLabel === nextTarget.statusLabel &&
      target.imageUrl === nextTarget.imageUrl &&
      target.href === nextTarget.href &&
      target.width === nextTarget.width &&
      target.height === nextTarget.height &&
      target.totalDiamonds === nextTarget.totalDiamonds &&
      JSON.stringify(target.selectedMetadata) === JSON.stringify(nextTarget.selectedMetadata)
    );
  });
}

export function reconcileTargetPool(
  current: RandomizerTarget[],
  next: RandomizerTarget[]
): RandomizerTarget[] {
  if (isSameTargetPool(current, next)) return current;
  const nextById = new Map(next.map(target => [target.id, target]));
  const sameIds =
    current.length === next.length && current.every(target => nextById.has(target.id));
  return sameIds ? current.map(target => nextById.get(target.id)!) : next;
}

export function buildSpinMetadata({
  target,
  mode,
  eligibility,
  selectedTargetIds,
  selectedTargets,
  section,
}: {
  target: RandomizerTarget;
  mode: RandomizerMode;
  eligibility: RandomizerEligibility;
  selectedTargetIds: readonly string[];
  selectedTargets: readonly RandomizerTarget[];
  section?: RandomizerSection;
}): RandomizerSpinMetadata {
  return {
    version: 1,
    mode,
    target: {
      id: target.id,
      targetType: target.targetType,
      title: target.title,
      subtitle: target.subtitle,
      href: target.href,
    },
    eligibility: {
      ...eligibility,
      diamondStatuses: [...eligibility.diamondStatuses],
      bookStatuses: [...eligibility.bookStatuses],
      pageStatuses: [...eligibility.pageStatuses],
    },
    selectedTargetIds: [...selectedTargetIds],
    selectedTargets: selectedTargets.map(selectedTarget => ({
      id: selectedTarget.id,
      targetType: selectedTarget.targetType,
      title: selectedTarget.title,
      subtitle: selectedTarget.subtitle,
    })),
    section: section
      ? section.kind === 'number'
        ? { ...section, candidates: [...section.candidates] }
        : { ...section }
      : undefined,
  };
}
