import { decode } from 'html-entities';
import sanitizeHtml from 'sanitize-html';
import { isSafeSourceUrl, PUBLIC_PAGE_SLUGS } from './wordpress.mjs';
import { editorialDate } from './dates.mjs';

const ALLOWED_TAGS = [
  'a',
  'b',
  'blockquote',
  'br',
  'cite',
  'code',
  'div',
  'em',
  'figcaption',
  'figure',
  'h2',
  'h3',
  'h4',
  'hr',
  'i',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
];
const RESERVED_SLUGS = new Set([
  'index',
  'page',
  'rss.xml',
  'sitemap.xml',
  '_astro',
  'contact',
  ...PUBLIC_PAGE_SLUGS,
]);

function textFromHtml(value) {
  return typeof value === 'string'
    ? decode(sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })).trim()
    : '';
}

function safeUrl(value, sourceOrigin) {
  const url = new URL(value, sourceOrigin);
  return isSafeSourceUrl(url) && (url.protocol === 'https:' || url.origin === sourceOrigin)
    ? url
    : null;
}

function rewriteUrl(value, sourceOrigin, postLinks) {
  if (value.startsWith('#')) return value;
  if (/^(mailto|tel):/i.test(value)) return value;
  try {
    const url = safeUrl(value, sourceOrigin);
    if (!url) return undefined;
    const key = `${url.origin}${url.pathname.replace(/\/?$/, '/')}`;
    const postPath = postLinks.get(key);
    const trackingOnly = [...url.searchParams.keys()].every(
      key => key === 'ref' || key.startsWith('utm_')
    );
    if (postPath && trackingOnly) return `${postPath}${url.search}${url.hash}`;
    return url.href;
  } catch {
    return undefined;
  }
}

export function sanitizePostHtml(html, { sourceOrigin, postLinks }) {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['src', 'alt', 'width', 'height', 'loading'],
      th: ['scope', 'colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
      ol: ['start'],
    },
    allowedSchemes: ['https', 'http', 'mailto', 'tel'],
    transformTags: {
      a: (_tagName, attrs) => ({
        tagName: 'a',
        attribs: {
          ...attrs,
          href: attrs.href ? rewriteUrl(attrs.href, sourceOrigin, postLinks) : undefined,
        },
      }),
      img: (_tagName, attrs) => ({
        tagName: 'img',
        attribs: {
          ...attrs,
          src: attrs.src ? rewriteUrl(attrs.src, sourceOrigin, new Map()) : undefined,
          loading: 'lazy',
        },
      }),
    },
  });
}

function wpDate(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) {
    throw new Error(`WordPress post has invalid ${field}`);
  }
  const date = new Date(`${value}Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`WordPress post has invalid ${field}`);
  return date.toISOString();
}

function featuredMedia(raw, sourceOrigin) {
  if (raw.featured_media === 0) return null;
  const media = raw._embedded?.['wp:featuredmedia']?.[0];
  if (!Number.isSafeInteger(raw.featured_media) || raw.featured_media <= 0 || !media?.source_url) {
    throw new Error(`WordPress post ${raw.id} is missing featured media metadata`);
  }
  const url = safeUrl(media.source_url, sourceOrigin);
  if (!url) throw new Error(`WordPress post ${raw.id} has an invalid featured media URL`);
  return {
    src: url.href,
    alt: typeof media.alt_text === 'string' ? textFromHtml(media.alt_text) : '',
    width: Number.isSafeInteger(media.media_details?.width) ? media.media_details.width : null,
    height: Number.isSafeInteger(media.media_details?.height) ? media.media_details.height : null,
  };
}

export function normalizePosts(rawPosts, sourceOrigin) {
  const source = new URL(sourceOrigin);
  if (!isSafeSourceUrl(source)) throw new Error('WordPress source host must use HTTPS');
  const ids = new Set();
  const slugs = new Set();
  const postLinks = publicPageLinks(source.origin);
  const publicPosts = rawPosts.filter(
    raw => !raw?.content?.protected && !raw?.excerpt?.protected && !raw?.password
  );

  for (const raw of publicPosts) {
    if (raw?.status !== 'publish' || raw?.type !== 'post') {
      throw new Error('WordPress returned a post that is not published');
    }
    if (!Number.isSafeInteger(raw.id) || raw.id <= 0 || ids.has(raw.id)) {
      throw new Error('WordPress returned a duplicate or invalid post ID');
    }
    if (RESERVED_SLUGS.has(raw.slug)) {
      throw new Error(`WordPress post ${raw.id} uses reserved slug ${raw.slug}`);
    }
    if (
      typeof raw.slug !== 'string' ||
      !/^[a-z0-9][a-z0-9._~-]*$/.test(raw.slug) ||
      slugs.has(raw.slug)
    ) {
      throw new Error('WordPress returned a duplicate or unsafe post slug');
    }
    const link = new URL(raw.link);
    if (
      link.origin !== source.origin ||
      link.username ||
      link.password ||
      link.search ||
      link.hash
    ) {
      throw new Error(`WordPress post ${raw.id} link is outside the source host`);
    }
    if (link.pathname !== `/${raw.slug}/`) {
      throw new Error(`WordPress post ${raw.id} has an unexpected permalink path`);
    }
    ids.add(raw.id);
    slugs.add(raw.slug);
    postLinks.set(`${link.origin}${link.pathname}`, `/updates/${raw.slug}/`);
  }

  return publicPosts
    .map(raw => {
      const title = textFromHtml(raw.title?.rendered);
      if (
        !title ||
        typeof raw.content?.rendered !== 'string' ||
        typeof raw.excerpt?.rendered !== 'string'
      ) {
        throw new Error(`WordPress post ${raw.id} is missing rendered content`);
      }
      return {
        id: raw.id,
        slug: raw.slug,
        url: `/updates/${raw.slug}/`,
        title,
        excerpt: textFromHtml(raw.excerpt.rendered),
        html: sanitizePostHtml(raw.content.rendered, { sourceOrigin: source.origin, postLinks }),
        displayDate: editorialDate(raw.date),
        publishedAt: wpDate(raw.date_gmt, 'date_gmt'),
        modifiedAt: wpDate(raw.modified_gmt, 'modified_gmt'),
        featuredMedia: featuredMedia(raw, source.origin),
      };
    })
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.id - a.id);
}

function publicPageLinks(sourceOrigin) {
  return new Map([
    [`${sourceOrigin}/`, '/updates/'],
    [`${sourceOrigin}/contact/`, '/contact'],
    ...PUBLIC_PAGE_SLUGS.map(slug => [`${sourceOrigin}/${slug}/`, `/updates/${slug}/`]),
  ]);
}

export function normalizePages(rawPages, sourceOrigin) {
  const source = new URL(sourceOrigin);
  if (!isSafeSourceUrl(source)) throw new Error('WordPress source host must use HTTPS');
  const ids = new Set();
  const slugs = new Set();
  const postLinks = publicPageLinks(source.origin);
  const pages = rawPages.map(raw => {
    if (
      raw?.type !== 'page' ||
      raw.status !== 'publish' ||
      !PUBLIC_PAGE_SLUGS.includes(raw.slug) ||
      slugs.has(raw.slug) ||
      !Number.isSafeInteger(raw.id) ||
      raw.id <= 0 ||
      ids.has(raw.id) ||
      raw.content?.protected ||
      raw.password
    ) {
      throw new Error('WordPress returned an invalid public page');
    }
    const link = new URL(raw.link);
    if (link.href !== `${source.origin}/${raw.slug}/`) {
      throw new Error('WordPress page has an unexpected permalink');
    }
    const title = textFromHtml(raw.title?.rendered);
    const html = raw.content?.rendered;
    if (!title || typeof html !== 'string' || !html.trim()) {
      throw new Error('WordPress page is missing rendered content');
    }
    if (/<(?:form|iframe)\b|wp-block-jetpack-contact-form|\[mailpoet[_\s]/i.test(html)) {
      throw new Error('WordPress public page contains dynamic content');
    }
    ids.add(raw.id);
    slugs.add(raw.slug);
    return {
      id: raw.id,
      slug: raw.slug,
      url: `/updates/${raw.slug}/`,
      title,
      excerpt: textFromHtml(html).slice(0, 200),
      html: sanitizePostHtml(html, { sourceOrigin: source.origin, postLinks }),
    };
  });
  if (PUBLIC_PAGE_SLUGS.some(slug => !slugs.has(slug))) {
    throw new Error('WordPress is missing a required public page');
  }
  return pages.sort(
    (a, b) => PUBLIC_PAGE_SLUGS.indexOf(a.slug) - PUBLIC_PAGE_SLUGS.indexOf(b.slug)
  );
}

export function mailpoetIframeUrl(value, sourceOrigin) {
  if (!value) return null;
  const url = new URL(value);
  const allowedOrigin = url.origin === new URL(sourceOrigin).origin;
  if (
    !isSafeSourceUrl(url) ||
    !allowedOrigin ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.searchParams.get('mailpoet_form_iframe') !== '1'
  ) {
    throw new Error('MailPoet iframe URL must be HTTPS on the WordPress source host');
  }
  return url.href;
}
