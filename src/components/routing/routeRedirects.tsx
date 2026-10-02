import { lazy } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';

const Profile = lazy(() => import('@/pages/Profile'));

const PROFILE_TAB_REDIRECTS: Record<string, string> = {
  companies: '/options/companies',
  artists: '/options/artists',
  tags: '/options/tags',
  publishers: '/options/publishers',
  illustrators: '/options/illustrators',
};

export const ProfileListRedirect = () => {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');

  if (tab && PROFILE_TAB_REDIRECTS[tab]) {
    return <Navigate to={PROFILE_TAB_REDIRECTS[tab]} replace />;
  }

  return <Profile />;
};

export const LegacyNewColoringBookRedirect = () => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  searchParams.set('craft', 'coloring');

  return (
    <Navigate
      to={{
        pathname: '/projects/new',
        search: `?${searchParams.toString()}`,
      }}
      replace
    />
  );
};

export const ImportRedirect = () => <Navigate to="/profile?tab=data" replace />;
