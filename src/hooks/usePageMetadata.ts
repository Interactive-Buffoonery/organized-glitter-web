import { useEffect } from 'react';

interface OpenGraphMetadata {
  title?: string;
  description?: string;
  type?: string;
  url?: string;
  image?: string;
  imageAlt?: string;
  imageWidth?: string;
  imageHeight?: string;
  siteName?: string;
  locale?: string;
}

interface TwitterMetadata {
  card?: string;
  title?: string;
  description?: string;
  image?: string;
  imageAlt?: string;
}

interface StructuredDataMetadata {
  id: string;
  data: Record<string, unknown> | Record<string, unknown>[];
}

interface PageMetadataOptions {
  title: string;
  description?: string;
  canonicalUrl?: string;
  openGraph?: OpenGraphMetadata;
  twitter?: TwitterMetadata;
  structuredData?: StructuredDataMetadata;
  robots?: string;
}

const DESCRIPTION_SELECTOR = 'meta[name="description"]';
const CANONICAL_SELECTOR = 'link[rel="canonical"]';

function updateMeta(attribute: 'name' | 'property', key: string, content?: string) {
  if (!content) return undefined;

  const selector = `meta[${attribute}="${key}"]`;
  const existingMeta = document.querySelector<HTMLMetaElement>(selector);
  const meta = existingMeta ?? document.createElement('meta');
  const previousContent = existingMeta?.getAttribute('content') ?? null;

  if (!existingMeta) {
    meta.setAttribute(attribute, key);
    document.head.appendChild(meta);
  }

  meta.setAttribute('content', content);

  return () => {
    if (!existingMeta) {
      meta.remove();
      return;
    }

    if (previousContent === null) {
      existingMeta.removeAttribute('content');
      return;
    }

    existingMeta.setAttribute('content', previousContent);
  };
}

function updateCanonical(href?: string) {
  if (!href) return undefined;

  const existingLink = document.querySelector<HTMLLinkElement>(CANONICAL_SELECTOR);
  const link = existingLink ?? document.createElement('link');
  const previousHref = existingLink?.getAttribute('href') ?? null;

  if (!existingLink) {
    link.rel = 'canonical';
    document.head.appendChild(link);
  }

  link.href = href;

  return () => {
    if (!existingLink) {
      link.remove();
      return;
    }

    if (previousHref === null) {
      existingLink.removeAttribute('href');
      return;
    }

    existingLink.setAttribute('href', previousHref);
  };
}

function updateStructuredData(metadata?: StructuredDataMetadata) {
  if (!metadata) return undefined;

  const selector = `script[type="application/ld+json"][data-page-metadata-id="${metadata.id}"]`;
  const existingScript = document.querySelector<HTMLScriptElement>(selector);
  const script = existingScript ?? document.createElement('script');
  const previousText = existingScript?.textContent ?? null;

  if (!existingScript) {
    script.type = 'application/ld+json';
    script.dataset.pageMetadataId = metadata.id;
    document.head.appendChild(script);
  }

  script.textContent = JSON.stringify(metadata.data);

  return () => {
    if (!existingScript) {
      script.remove();
      return;
    }

    script.textContent = previousText;
  };
}

export function usePageMetadata({
  title,
  description,
  canonicalUrl,
  openGraph,
  twitter,
  structuredData,
  robots,
}: PageMetadataOptions) {
  useEffect(() => {
    const previousTitle = document.title;
    const existingDescription = document.querySelector<HTMLMetaElement>(DESCRIPTION_SELECTOR);
    const previousDescription = existingDescription?.getAttribute('content') ?? null;
    let createdDescription = false;
    const cleanupTasks = [
      updateCanonical(canonicalUrl),
      updateMeta('name', 'robots', robots),
      updateMeta('property', 'og:title', openGraph?.title ?? title),
      updateMeta('property', 'og:description', openGraph?.description ?? description),
      updateMeta('property', 'og:type', openGraph?.type),
      updateMeta('property', 'og:url', openGraph?.url ?? canonicalUrl),
      updateMeta('property', 'og:image', openGraph?.image),
      updateMeta('property', 'og:image:alt', openGraph?.imageAlt),
      updateMeta('property', 'og:image:width', openGraph?.imageWidth),
      updateMeta('property', 'og:image:height', openGraph?.imageHeight),
      updateMeta('property', 'og:site_name', openGraph?.siteName),
      updateMeta('property', 'og:locale', openGraph?.locale),
      updateMeta('name', 'twitter:card', twitter?.card),
      updateMeta('name', 'twitter:title', twitter?.title ?? openGraph?.title ?? title),
      updateMeta(
        'name',
        'twitter:description',
        twitter?.description ?? openGraph?.description ?? description
      ),
      updateMeta('name', 'twitter:image', twitter?.image ?? openGraph?.image),
      updateMeta('name', 'twitter:image:alt', twitter?.imageAlt ?? openGraph?.imageAlt),
      updateStructuredData(structuredData),
    ];

    document.title = title;

    if (description) {
      if (existingDescription) {
        existingDescription.setAttribute('content', description);
      } else {
        const meta = document.createElement('meta');
        meta.name = 'description';
        meta.content = description;
        document.head.appendChild(meta);
        createdDescription = true;
      }
    }

    return () => {
      cleanupTasks.forEach(cleanup => cleanup?.());
      document.title = previousTitle;

      if (!description) {
        return;
      }

      if (createdDescription) {
        const createdMeta = document.querySelector<HTMLMetaElement>(DESCRIPTION_SELECTOR);
        createdMeta?.remove();
        return;
      }

      if (existingDescription && previousDescription !== null) {
        existingDescription.setAttribute('content', previousDescription);
      }
    };
  }, [canonicalUrl, description, openGraph, structuredData, title, twitter, robots]);
}

const NOINDEX_ROBOTS = 'noindex, nofollow';

export function useNoIndexPage(title: string) {
  usePageMetadata({ title, robots: NOINDEX_ROBOTS });
}
