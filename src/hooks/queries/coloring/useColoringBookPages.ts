import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';
import { ColoringService } from '@/services/pocketbase/coloring.service';
import { ColoringPageProgressNotesService } from '@/services/pocketbase/coloringPageProgressNotes.service';

export function useColoringBookPages(bookId?: string) {
  return useQuery({
    queryKey: queryKeys.coloring.pages.book(bookId ?? ''),
    queryFn: () => ColoringService.listAllPages({ bookId: bookId! }),
    enabled: Boolean(bookId),
    ...queryFreshness('frequent'),
  });
}

export function useColoringBookPagePhotos(bookId?: string, userId?: string) {
  return useQuery({
    queryKey: queryKeys.coloring.pages.bookPhotos(bookId ?? '', userId ?? ''),
    queryFn: () =>
      ColoringPageProgressNotesService.listLatestImagesForBook({
        userId: userId!,
        bookId: bookId!,
      }),
    enabled: Boolean(bookId && userId),
    ...queryFreshness('frequent'),
  });
}
