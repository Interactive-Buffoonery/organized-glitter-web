import { useSyncExternalStore } from 'react';
import { Navigate } from 'react-router-dom';
import { ManageListsLayout } from '@/components/manage-lists/ManageListsLayout';
import { useManageListGroups } from '@/components/manage-lists/useManageListGroups';
import { useAppReady } from '@/hooks/useAppReady';

const LARGE_SCREEN_QUERY = '(min-width: 1024px)';

const subscribeToLargeScreen = (onChange: () => void) => {
  const query = window.matchMedia(LARGE_SCREEN_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

const isLargeScreen = () => window.matchMedia(LARGE_SCREEN_QUERY).matches;

export default function Options() {
  useAppReady();
  const { groups, isLoading } = useManageListGroups();
  const largeScreen = useSyncExternalStore(subscribeToLargeScreen, isLargeScreen);
  const firstList = groups[0]?.items[0];

  if (!isLoading && firstList && largeScreen) {
    return <Navigate to={firstList.href} replace />;
  }

  return <ManageListsLayout />;
}
