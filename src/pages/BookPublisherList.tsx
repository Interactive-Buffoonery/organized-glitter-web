import { ManageListsLayout } from '@/components/manage-lists/ManageListsLayout';
import { BookTaxonomyListTab } from '@/components/profile/BookTaxonomyListTab';
import { useAppReady } from '@/hooks/useAppReady';

export default function BookPublisherList() {
  useAppReady();
  return (
    <ManageListsLayout>
      <BookTaxonomyListTab kind="publishers" />
    </ManageListsLayout>
  );
}
