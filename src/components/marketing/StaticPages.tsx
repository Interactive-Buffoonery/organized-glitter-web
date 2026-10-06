/* eslint-disable react-refresh/only-export-components */
import { renderToStaticMarkup } from 'react-dom/server';
import { Link, MemoryRouter } from 'react-router-dom';
import { X } from 'lucide-react';

import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { HostingNoticeContent } from '@/components/layout/HostingNotice';
import { PrivacyPolicy } from '@/components/legal/PrivacyPolicy';
import { TermsOfService } from '@/components/legal/TermsOfService';
import { cn } from '@/lib/utils';
import { HomeHero } from './HomeHero';
import { SarahSignature } from './SarahSignature';
import { ScrapbookFeatures } from './ScrapbookFeatures';
import { TwoCraftsSplit } from './TwoCraftsSplit';

// Signed-out SiteHeader without the theme toggle, which needs JavaScript.
// Returning members use Login, which forwards an existing session to /overview.
function StaticSiteHeader() {
  return (
    <header
      className="site-header-safe-area border-border bg-background/90 sticky top-0 z-40 border-b backdrop-blur-md"
      aria-label="Site header"
    >
      <div className="relative container mx-auto flex items-center justify-between p-4">
        <Link
          to="/"
          className="focus-visible:ring-ring focus-visible:ring-offset-background flex min-h-11 min-w-11 items-center justify-center gap-2.5 rounded-xl focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          aria-label="Organized Glitter home"
        >
          <img
            src="/images/logo.png"
            alt=""
            aria-hidden
            width={32}
            height={32}
            className="size-8 flex-shrink-0 object-contain"
          />
          <span className="font-handwritten text-foreground hidden text-2xl whitespace-nowrap sm:inline">
            Organized Glitter
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" className="text-foreground/80 hover:text-foreground">
            <Link to="/login">Login</Link>
          </Button>
          <Button asChild variant="glass" className="hidden font-medium sm:inline-flex">
            <Link to="/register">Get Started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

interface StaticPageProps {
  children: ReactNode;
  currentPage: string;
  className?: string;
}

/** Signed-out MainLayout for pages rendered at build time. */
function StaticPage({ children, currentPage, className }: StaticPageProps) {
  return (
    <div
      className="mobile-app-container text-foreground"
      data-static-landing={currentPage === 'Home' ? true : undefined}
    >
      <div className={cn('aurora-bg flex min-h-full flex-col', className)}>
        <a
          href="#main-content"
          className="focus:bg-background focus:text-foreground focus:ring-ring focus:ring-offset-background sr-only fixed top-4 left-4 z-50 rounded-md px-4 py-2 text-sm font-semibold shadow-lg focus:not-sr-only focus:ring-2 focus:ring-offset-2 focus:outline-none"
        >
          Skip to content
        </a>
        <StaticSiteHeader />
        {currentPage === 'Home' && (
          <HostingNoticeContent>
            <template data-notice-dismiss>
              <Button
                type="button"
                variant="ghost"
                size="icon-touch"
                aria-label="Close hosting notice"
              >
                <X aria-hidden="true" />
              </Button>
            </template>
          </HostingNoticeContent>
        )}
        <main id="main-content" tabIndex={-1} className="flex-grow">
          {children}
        </main>
        <SiteFooter currentPage={currentPage} />
      </div>
    </div>
  );
}

const pages: Record<string, () => ReactNode> = {
  landing: () => (
    <StaticPage currentPage="Home" className="home-marketing-bg">
      <HomeHero />
      <TwoCraftsSplit />
      <ScrapbookFeatures />
      <SarahSignature />
    </StaticPage>
  ),
  privacy: () => (
    <StaticPage currentPage="Privacy">
      <PrivacyPolicy />
    </StaticPage>
  ),
  terms: () => (
    <StaticPage currentPage="Terms">
      <TermsOfService />
    </StaticPage>
  ),
};

/** Page markup rendered at build time into the matching static HTML entry. */
export function renderStaticPage(page: string): string {
  const render = pages[page];
  if (!render) throw new Error(`No static page for ${page}`);
  return renderToStaticMarkup(<MemoryRouter>{render()}</MemoryRouter>);
}
