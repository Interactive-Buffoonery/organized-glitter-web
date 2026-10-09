import { Navigate } from 'react-router-dom';
import { ManageListsLayout } from '@/components/manage-lists/ManageListsLayout';
import { useManageListGroups } from '@/components/manage-lists/useManageListGroups';
import { useAppReady } from '@/hooks/useAppReady';

const LARGE_SCREEN_QUERY = '(min-width: 1024px)';

export default function Options() {
  useAppReady();
  const { groups, isLoading } = useManageListGroups();
  const firstList = groups[0]?.items[0];

  // ponytail: checked once on load; resizing to large on the picker keeps the picker
  if (!isLoading && firstList && window.matchMedia(LARGE_SCREEN_QUERY).matches) {
    return <Navigate to={firstList.href} replace />;
  }

  return <ManageListsLayout />;
}
