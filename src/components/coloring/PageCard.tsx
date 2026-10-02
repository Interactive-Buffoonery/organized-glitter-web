import { ContactSheetCell } from './ContactSheetCell';
import type { ColoringPageDTO } from '@/services/pocketbase/coloring.service';

interface PageCardProps {
  bookId: string;
  page: ColoringPageDTO;
  returnTo: string;
  isMysteryBook?: boolean;
}

export function PageCard({ bookId, page, returnTo, isMysteryBook = false }: PageCardProps) {
  return (
    <ContactSheetCell
      bookId={bookId}
      page={page}
      returnTo={returnTo}
      isMysteryBook={isMysteryBook}
    />
  );
}
