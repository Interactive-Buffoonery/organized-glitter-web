import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { Navigate } from 'react-router-dom';
import { ManageListsLayout } from '@/components/manage-lists/ManageListsLayout';
import { useManageListGroups } from '@/components/manage-lists/useManageListGroups';
import { useAppReady } from '@/hooks/useAppReady';

// Matches the `lg` breakpoint where ManageListsLayout shows the sidebar.
const LARGE_SCREEN_QUERY = '(min-width: 1024px)';

export default function Options() {
  useAppReady();
  const { groups, isLoading } = useManageListGroups();
  const largeScreenQuery = useMemo(() => window.matchMedia(LARGE_SCREEN_QUERY), []);
  const subscribe = useCallback(
    (onChange: () => void) => {
      largeScreenQuery.addEventListener('change', onChange);
      return () => largeScreenQuery.removeEventListener('change', onChange);
    },
    [largeScreenQuery]
  );
  const largeScreen = useSyncExternalStore(subscribe, () => largeScreenQuery.matches);
  const firstList = groups[0]?.items[0];

  if (!isLoading && firstList && largeScreen) {
    return <Navigate to={firstList.href} replace />;
  }

  return <ManageListsLayout />;
}
