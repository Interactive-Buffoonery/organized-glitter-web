import { Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import MainLayout from '@/components/layout/MainLayout';
import { createLogger } from '@/utils/logger';
import { useAppReady } from '@/hooks/useAppReady';
import recovery from '@/content/not-found.json';

const logger = createLogger('NotFound');

const NotFound = () => {
  useAppReady();
  const routeLocation = useLocation();

  useEffect(() => {
    logger.error('404 Error: User attempted to access non-existent route:', {
      pathname: routeLocation.pathname,
      search: routeLocation.search,
      hash: routeLocation.hash,
      state: routeLocation.state,
      browserPathname: window.location.pathname,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent.substring(0, 100),
    });
  }, [routeLocation.pathname, routeLocation.search, routeLocation.hash, routeLocation.state]);

  return (
    <MainLayout currentPage="Not Found">
      <div className="container mx-auto flex min-h-[60svh] items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <h1 className="font-handwritten text-4xl leading-tight font-semibold sm:text-5xl">
            {recovery.heading}
          </h1>
          <p className="text-muted-foreground mt-5 text-lg text-pretty">{recovery.description}</p>
          <Button asChild className="mt-8 min-h-12 w-full px-6 sm:w-auto">
            <Link to={recovery.home.href}>{recovery.home.label}</Link>
          </Button>
          <Link
            to={recovery.library.href}
            className="decoration-primary hover:decoration-accent focus-visible:ring-ring mt-3 block min-h-11 w-fit rounded-sm py-2.5 underline decoration-2 underline-offset-4 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {recovery.library.label}
          </Link>
          <p className="border-border text-muted-foreground mt-8 border-t pt-5 text-sm">
            {recovery.errorCode}
          </p>
        </div>
      </div>
    </MainLayout>
  );
};

export default NotFound;
