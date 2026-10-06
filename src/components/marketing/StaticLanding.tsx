/* eslint-disable react-refresh/only-export-components */
import { renderToStaticMarkup } from 'react-dom/server';
import { Link, MemoryRouter } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { SiteFooter } from '@/components/layout/SiteFooter';
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

/** Home page markup rendered at build time into dist/index.html. */
function StaticLanding() {
  return (
    <div className="mobile-app-container text-foreground" data-static-landing>
      <div className="aurora-bg home-marketing-bg flex min-h-full flex-col">
        <a
          href="#main-content"
          className="focus:bg-background focus:text-foreground focus:ring-ring focus:ring-offset-background sr-only fixed top-4 left-4 z-50 rounded-md px-4 py-2 text-sm font-semibold shadow-lg focus:not-sr-only focus:ring-2 focus:ring-offset-2 focus:outline-none"
        >
          Skip to content
        </a>
        <StaticSiteHeader />
        <main id="main-content" tabIndex={-1} className="flex-grow">
          <HomeHero />
          <TwoCraftsSplit />
          <ScrapbookFeatures />
          <SarahSignature />
        </main>
        <SiteFooter currentPage="Home" />
      </div>
    </div>
  );
}

export function renderStaticLanding(): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <StaticLanding />
    </MemoryRouter>
  );
}
