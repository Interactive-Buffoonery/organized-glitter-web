import { ManageListsLayout } from '@/components/manage-lists/ManageListsLayout';
import { BookTaxonomyListTab } from '@/components/profile/BookTaxonomyListTab';
import { useAppReady } from '@/hooks/useAppReady';

export default function BookIllustratorList() {
  useAppReady();
  return (
    <ManageListsLayout>
      <BookTaxonomyListTab kind="illustrators" />
    </ManageListsLayout>
  );
}
