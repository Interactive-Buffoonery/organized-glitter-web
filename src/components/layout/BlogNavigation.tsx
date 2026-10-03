import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { SiteHeader } from '@/components/layout/SiteHeader';
import BottomNavigation from '@/components/layout/BottomNavigation';
import { useAuth } from '@/hooks/useAuth';

const initialPath = window.location.pathname + window.location.search;

export function BlogNavigation() {
  const { user } = useAuth();
  const location = useLocation();
  const destination = location.pathname + location.search + location.hash;

  useEffect(() => {
    if (location.pathname + location.search !== initialPath) window.location.replace(destination);
  }, [destination, location.pathname, location.search]);

  useEffect(() => {
    const guestHeader = document.getElementById('blog-guest-header');
    if (guestHeader) guestHeader.hidden = true;
    document.documentElement.dataset.blogNavigation = 'active';
    return () => {
      if (guestHeader) guestHeader.hidden = false;
      delete document.documentElement.dataset.blogNavigation;
    };
  }, []);

  return (
    <>
      <SiteHeader currentPage="Updates" />
      {user && <BottomNavigation />}
    </>
  );
}
