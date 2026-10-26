import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { queryFreshness } from '@/hooks/queries/shared/queryUtils';
import { ColoringService } from '@/services/pocketbase/coloring.service';
import { ColoringPageProgressNotesService } from '@/services/pocketbase/coloringPageProgressNotes.service';

export function useColoringBookPages(bookId?: string) {
  return useQuery({
    queryKey: [...queryKeys.coloring.pages.lists(), 'book', bookId],
    queryFn: () => ColoringService.listAllPages({ bookId: bookId! }),
    enabled: Boolean(bookId),
    ...queryFreshness('frequent'),
  });
}

export function useColoringBookPagePhotos(bookId?: string, userId?: string) {
  return useQuery({
    queryKey: [...queryKeys.coloring.pages.lists(), 'book-photos', bookId, userId],
    queryFn: async () => {
      const notes = await ColoringPageProgressNotesService.listAllForUser({
        userId: userId!,
        sourceId: bookId!,
        hasImage: true,
      });
      const photos: Record<string, string> = {};
      for (const note of notes) {
        if (note.imageUrl && !photos[note.pageId]) photos[note.pageId] = note.imageUrl;
      }
      return photos;
    },
    enabled: Boolean(bookId && userId),
    ...queryFreshness('frequent'),
  });
}
