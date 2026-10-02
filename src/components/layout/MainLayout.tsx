import React, { memo } from 'react';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';
import { HostingNotice } from './HostingNotice';
import BottomNavigation from './BottomNavigation';
import { useAuth } from '@/hooks/useAuth';
import { useMobileDevice } from '@/hooks/use-mobile';
import LoadingState from '@/components/projects/LoadingState';
import { cn } from '@/lib/utils';

interface MainLayoutProps {
  children: React.ReactNode;
  currentPage?: string;
  showLoader?: boolean;
  hideNav?: boolean;
  hideFooter?: boolean;
  rootClassName?: string;
}

const MainLayout = memo(
  ({
    children,
    currentPage = '',
    showLoader = false,
    hideNav = false,
    hideFooter = false,
    rootClassName,
  }: MainLayoutProps) => {
    const { user, isLoading } = useAuth();
    const { isMobile, isTablet } = useMobileDevice();

    const isLoggedIn = !!user;
    const showBottomNav = isLoggedIn && (isMobile || isTablet);
    const rootLayoutClassName = cn(
      'aurora-bg flex min-h-full flex-col',
      hideNav && 'site-header-safe-area',
      rootClassName
    );
    const skipLink = (
      <a
        href="#main-content"
        className="focus:bg-background focus:text-foreground focus:ring-ring focus:ring-offset-background sr-only fixed top-4 left-4 z-50 rounded-md px-4 py-2 text-sm font-semibold shadow-lg focus:not-sr-only focus:ring-2 focus:ring-offset-2 focus:outline-none"
      >
        Skip to content
      </a>
    );

    if (isLoading && showLoader) {
      return (
        <div className={rootLayoutClassName}>
          {skipLink}
          {!hideNav && <SiteHeader currentPage={currentPage} />}
          <HostingNotice />
          <main id="main-content" tabIndex={-1} className="flex-grow">
            <LoadingState />
          </main>
        </div>
      );
    }

    return (
      <div className={rootLayoutClassName}>
        {skipLink}
        {!hideNav && <SiteHeader currentPage={currentPage} />}
        <HostingNotice />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-grow"
          style={showBottomNav ? { paddingBottom: 'var(--bottom-nav-total-height)' } : undefined}
        >
          {children}
        </main>
        {!hideFooter && !showBottomNav && <SiteFooter currentPage={currentPage} />}
        {showBottomNav && <BottomNavigation />}
      </div>
    );
  }
);

MainLayout.displayName = 'MainLayout';

export default MainLayout;
