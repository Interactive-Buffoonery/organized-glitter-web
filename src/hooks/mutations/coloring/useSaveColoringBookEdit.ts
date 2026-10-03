import { useQueryClient } from '@tanstack/react-query';

import { useUpdateColoringBook } from '@/hooks/mutations/coloring/useUpdateColoringBook';
import { refreshColoringBookAfterFormSave } from '@/hooks/mutations/coloring/coloringMutationCache';
import { notify } from '@/lib/notifications';
import type { ColoringBookSubmitValues } from '@/schemas/coloring/coloringBook.schema';
import type { ColoringBookDTO } from '@/services/pocketbase/coloring.service';
import { createLogger } from '@/utils/logger';

const logger = createLogger('useSaveColoringBookEdit');

const trimOrEmpty = (value?: string) => value?.trim() ?? '';

const publicationYearForEdit = (nextYear: number | undefined, previousYear: number | undefined) =>
  nextYear ?? (previousYear === undefined ? undefined : 0);

const notifySafely = (notification: Parameters<typeof notify>[0]) => {
  try {
    notify(notification);
  } catch (error) {
    logger.error('Notification failed after coloring book update', error);
  }
};

export function useSaveColoringBookEdit() {
  const queryClient = useQueryClient();
  const updateBook = useUpdateColoringBook();

  const saveColoringBookEdit = async (
    book: ColoringBookDTO,
    values: ColoringBookSubmitValues,
    onConfirmedSave: () => void,
    expectedRevision: number,
    changedTagIds?: string[]
  ) => {
    const result = await updateBook.mutateAsync({
      bookId: book.id,
      patch: {
        title: values.title.trim(),
        ...(values.totalPages !== book.totalPages ? { total_pages: values.totalPages } : {}),
        status: values.status,
        series: trimOrEmpty(values.series),
        theme: trimOrEmpty(values.theme),
        isbn: trimOrEmpty(values.isbn),
        source_url: trimOrEmpty(values.sourceUrl),
        notes: trimOrEmpty(values.notes),
        edition: trimOrEmpty(values.edition),
        date_purchased: values.datePurchased ?? '',
        date_received: values.dateReceived ?? '',
        date_started: values.dateStarted ?? '',
        date_completed: values.dateCompleted ?? '',
        publication_year: publicationYearForEdit(values.publicationYear, book.publicationYear),
        book_format: values.bookFormat || '',
        language: values.language || '',
        is_mystery: values.isMystery,
        publisher: values.publisher || '',
        illustrator: values.illustrator || '',
        cover_image: values.coverImage ?? (values.coverImageRemoved ? '' : undefined),
      },
      tagIds: changedTagIds,
      onConfirmedSave,
      expectedRevision,
    });

    await refreshColoringBookAfterFormSave(queryClient, book.id, 'update');

    if (result.tagSyncError) {
      notifySafely({
        kind: 'warning',
        title: "Coloring book updated, but tags didn't save",
        description: 'Open the book to retry your tags.',
      });
    }

    return result.book;
  };

  return {
    saveColoringBookEdit,
    isPending: updateBook.isPending,
  };
}
