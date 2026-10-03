import type { ColoringMediumsService } from '@/services/pocketbase/coloringMediums.service';
import type { ColoringMediumRecord } from '@/types/coloringMedium';

export type ColoringMediumListCache = Awaited<
  ReturnType<typeof ColoringMediumsService.listColoringMediums>
>;

const compareMediums = (left: ColoringMediumRecord, right: ColoringMediumRecord): number => {
  const typeOrder = left.type.localeCompare(right.type);
  return typeOrder === 0 ? left.name.localeCompare(right.name) : typeOrder;
};

export const mergeUpdatedColoringMediumIntoCache = (
  data: ColoringMediumListCache | undefined,
  updated: ColoringMediumRecord
): ColoringMediumListCache | undefined => {
  if (!data) return data;

  let didUpdate = false;
  const items = data.items.map(item => {
    if (item.id !== updated.id) return item;
    didUpdate = true;
    return updated;
  });

  if (!didUpdate) return data;
  return { ...data, items: items.sort(compareMediums) };
};
