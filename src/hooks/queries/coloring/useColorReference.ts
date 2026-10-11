import { queryKeys } from '@/hooks/queries/queryKeys';
import { useQuery } from '@tanstack/react-query';
import {
  ColorReferencesService,
  type ColorReference,
} from '@/services/pocketbase/colorReferences.service';
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';

export const colorReferenceKey = (userId: string, pageId: string) =>
  queryKeys.coloring.colorReferences.detail(userId, pageId);

export function useColorReference(pageId: string, userId: string) {
  return useQuery({
    queryKey: colorReferenceKey(userId, pageId),
    queryFn: () => ColorReferencesService.get(pageId, userId),
    enabled: Boolean(pageId && userId),
  });
}

export function useColorReferenceImages(
  reference: ColorReference | null | undefined,
  userId: string
) {
  return useQuery({
    queryKey: queryKeys.coloring.colorReferences.images(
      userId,
      reference?.page ?? '',
      reference?.updated ?? ''
    ),
    queryFn: () => (reference ? ColorReferencesService.urls(reference, userId) : []),
    enabled: Boolean(reference?.photos.length && userId),
    ...queryFreshness('frequent'),
  });
}
