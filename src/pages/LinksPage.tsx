/**
 * Links page - A link-in-bio style page for social media sharing
 * @author @serabi
 * @created 2025-01-24
 */

import React, { useEffect } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { ExternalLink, Heart, Camera } from 'lucide-react';
import { createLogger } from '@/utils/logger';
import { useAppReady } from '@/hooks/useAppReady';
import { usePageMetadata } from '@/hooks/usePageMetadata';
import { cn } from '@/lib/utils';

const logger = createLogger('LinksPage');
const LINKS_PAGE_URL = 'https://organizedglitter.app/links';
const LINKS_PAGE_TITLE = "Sarah's Links | Organized Glitter";
const LINKS_PAGE_DESCRIPTION =
  "Sarah's current Organized Glitter links: the free coloring book and diamond art tracker, craft videos, affiliate codes, and Instagram.";
const SOCIAL_IMAGE_URL = 'https://organizedglitter.app/images/social-preview-2026-09-27.jpg';
const SOCIAL_IMAGE_ALT =
  'Organized Glitter: track your coloring books and diamond art, with taped-in photos of a coloring page and a finished diamond painting';

const linkCardClasses =
  'group block rounded-lg border border-border bg-card p-4 text-card-foreground transition-colors hover:border-primary hover:bg-secondary focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none';

const sectionHeadingClasses =
  'text-muted-foreground text-center text-sm font-semibold tracking-normal';

// Configuration for easy updates
const profileConfig = {
  name: 'Sarah | Organized Glitter',
  avatar: '/images/chibi-wave.png',
  social: {
    instagram: 'https://www.instagram.com/organized_glitter',
  },
};

const primaryLinks = [
  {
    title: 'Try Organized Glitter',
    description: 'Track your coloring books and diamond art projects with ease',
    url: 'https://organizedglitter.app',
    iconSrc: '/images/logo.png',
    featured: true,
  },
];

const thingsIveTalkedAbout = [
  {
    title: '~\u2665 26 for 26: New Diamond Painting Challenge Announcement AND WIP Parade \u2665~',
    source: 'Shire Shenanigans',
    url: 'https://youtu.be/CRzIQbnZ9Ao?si=FS31lZA81dU7Dbot',
    thumbnail: 'https://i.ytimg.com/vi/CRzIQbnZ9Ao/maxresdefault.jpg',
  },
];

const affiliateLinks = [
  {
    title:
      "Check out ArtDot's new kits - and use my affiliate link to get $10 off your first order!",
    brand: 'ArtDot',
    url: 'https://www.artdot.com?loloyal_referral_code=G7BvKA9xR9rJ&utm_source=loloyal&utm_medium=referral&utm_campaign=loloyal_referrals',
    featured: true,
  },
  {
    title:
      'Use `PAR-F6NP7SF` to get 5% off your first order! Great source for the Disney mystery coloring books.',
    brand: 'Lireka',
    url: 'https://www.lireka.com/en',
    featured: true,
  },
];

const visibleLinks = [...primaryLinks, ...thingsIveTalkedAbout, ...affiliateLinks];
const UTILITY_REGISTER_CLASS = 'utility-register';

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  '@id': LINKS_PAGE_URL,
  url: LINKS_PAGE_URL,
  name: LINKS_PAGE_TITLE,
  description: LINKS_PAGE_DESCRIPTION,
  image: SOCIAL_IMAGE_URL,
  isPartOf: {
    '@type': 'WebSite',
    name: 'Organized Glitter',
    url: 'https://organizedglitter.app',
  },
  about: {
    '@type': 'WebApplication',
    name: 'Organized Glitter',
    url: 'https://organizedglitter.app',
    applicationCategory: 'LifestyleApplication',
    operatingSystem: 'Web',
  },
  mainEntity: {
    '@type': 'ItemList',
    itemListElement: visibleLinks.map((link, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: link.title,
      url: link.url,
    })),
  },
};

/**
 * Links page component - Link-in-bio style landing page
 */
const LinksPage: React.FC = () => {
  useAppReady();
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add(UTILITY_REGISTER_CLASS);
    return () => {
      root.classList.remove(UTILITY_REGISTER_CLASS);
    };
  }, []);
  usePageMetadata({
    title: LINKS_PAGE_TITLE,
    description: LINKS_PAGE_DESCRIPTION,
    canonicalUrl: LINKS_PAGE_URL,
    openGraph: {
      title: LINKS_PAGE_TITLE,
      description: LINKS_PAGE_DESCRIPTION,
      type: 'website',
      url: LINKS_PAGE_URL,
      image: SOCIAL_IMAGE_URL,
      imageAlt: SOCIAL_IMAGE_ALT,
      imageWidth: '2400',
      imageHeight: '1260',
      siteName: 'Organized Glitter',
      locale: 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title: LINKS_PAGE_TITLE,
      description: LINKS_PAGE_DESCRIPTION,
      image: SOCIAL_IMAGE_URL,
      imageAlt: SOCIAL_IMAGE_ALT,
    },
    structuredData: {
      id: 'links-page-structured-data',
      data: structuredData,
    },
  });

  const handleLinkClick = (url: string, title: string) => {
    logger.info('Link clicked from bio page', { url, title });
  };

  const handleSocialClick = (platform: string, url: string) => {
    logger.info('Social link clicked', { platform, url });
  };

  return (
    <MainLayout hideNav hideFooter>
      <div className="bg-background text-foreground min-h-screen">
        <div className="container mx-auto max-w-md px-4 py-8 sm:py-10">
          <header className="border-border bg-card text-card-foreground mb-6 rounded-lg border p-5 text-center">
            <div className="bg-primary/15 border-border mx-auto mb-4 size-24 overflow-hidden rounded-full border-[3px] shadow-md">
              <img
                src={profileConfig.avatar}
                alt="Chibi version of Sarah waving"
                className="size-full object-cover object-top"
              />
            </div>
            <h1 className="text-2xl leading-tight font-semibold tracking-normal">
              {profileConfig.name}
            </h1>
          </header>

          <div data-testid="links-page-card-actions">
            <section className="mb-6 space-y-3" aria-label="Primary links">
              {primaryLinks.map(link => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    linkCardClasses,
                    link.featured && 'border-primary/70 focus-visible:ring-primary'
                  )}
                  onClick={() => handleLinkClick(link.url, link.title)}
                >
                  <span className="flex items-center gap-3">
                    <img src={link.iconSrc} alt="" className="size-9 shrink-0 object-contain" />
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block font-semibold">{link.title}</span>
                      <span className="text-muted-foreground mt-1 block text-sm leading-relaxed">
                        {link.description}
                      </span>
                    </span>
                    <ExternalLink className="text-primary size-4 shrink-0" aria-hidden="true" />
                  </span>
                </a>
              ))}
            </section>

            <section
              className="border-border/80 space-y-3 border-t pt-6"
              aria-labelledby="things-talked-about-heading"
            >
              <h2 id="things-talked-about-heading" className={sectionHeadingClasses}>
                Things I've Talked About
              </h2>
              {thingsIveTalkedAbout.map(item => (
                <a
                  key={item.url}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkCardClasses}
                  onClick={() => handleLinkClick(item.url, item.title)}
                >
                  <span className="flex items-start gap-3">
                    <img
                      src={item.thumbnail}
                      alt=""
                      className="border-border aspect-video w-24 shrink-0 rounded-md border object-cover sm:w-28"
                      loading="lazy"
                    />
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-base leading-relaxed font-semibold">
                        {item.title}
                      </span>
                      <span className="text-muted-foreground mt-1 block text-sm">
                        YouTube: {item.source}
                      </span>
                    </span>
                    <ExternalLink
                      className="text-primary group-hover:text-foreground size-4 shrink-0 transition-colors"
                      aria-hidden="true"
                    />
                  </span>
                </a>
              ))}
            </section>

            <section
              className="border-border/80 mt-6 space-y-3 border-t pt-6"
              aria-labelledby="affiliate-links-heading"
            >
              <h2 id="affiliate-links-heading" className={sectionHeadingClasses}>
                Affiliate Links
              </h2>
              {affiliateLinks.map(link => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(linkCardClasses, link.featured && 'border-accent/70')}
                  onClick={() => handleLinkClick(link.url, link.title)}
                >
                  <span className="flex items-start gap-3">
                    <span className="min-w-0 flex-1 text-left">
                      <span className="text-link mb-2 block text-lg leading-tight font-bold">
                        {link.brand}
                      </span>
                      <span className="block text-base leading-relaxed">{link.title}</span>
                    </span>
                    <span className="text-link flex shrink-0 flex-col items-center gap-1">
                      <ExternalLink className="size-4" aria-hidden="true" />
                      <span className="text-xs font-semibold">Shop</span>
                    </span>
                  </span>
                </a>
              ))}
            </section>
          </div>

          <div className="mt-6 flex justify-center">
            <a
              href={profileConfig.social.instagram}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => handleSocialClick('Instagram', profileConfig.social.instagram)}
              className="border-input bg-background hover:bg-secondary focus-visible:ring-ring text-foreground focus-visible:ring-offset-background inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <Camera className="size-4" aria-hidden="true" />
              Follow on Instagram
            </a>
          </div>

          <footer className="mt-8 text-center">
            <p className="text-muted-foreground text-sm leading-relaxed">
              Made with <Heart className="text-destructive-text inline size-3" aria-hidden="true" />{' '}
              for coloring and diamond art enthusiasts
            </p>
            <p className="text-muted-foreground mt-1 text-xs">© 2026 Organized Glitter</p>
          </footer>
        </div>
      </div>
    </MainLayout>
  );
};

export default LinksPage;
