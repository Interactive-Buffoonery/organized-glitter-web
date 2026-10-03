const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_PAGES = 50;

export const DEFAULT_WORDPRESS_API_URL = undefined;
export const PUBLIC_PAGE_SLUGS = ['privacy-policy', 'subscription-confirmed'];

export function isSafeSourceUrl(url) {
  return (
    url.protocol === 'https:' ||
    (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  );
}

export function wordpressApiUrl(value = DEFAULT_WORDPRESS_API_URL) {
  if (!value) throw new Error('WORDPRESS_API_URL is required to fetch blog content');
  const url = new URL(value);
  if (!isSafeSourceUrl(url) || url.username || url.password || url.search || url.hash) {
    throw new Error(
      'WordPress API URL must use HTTPS, except for local fixtures, without credentials or parameters'
    );
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url;
}

async function fetchPage(url, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`WordPress returned HTTP ${response.status} for ${url}`);
    }
    const totalHeader = response.headers.get('x-wp-total');
    const pagesHeader = response.headers.get('x-wp-totalpages');
    if (!/^(0|[1-9]\d*)$/.test(totalHeader ?? '') || !/^(0|[1-9]\d*)$/.test(pagesHeader ?? '')) {
      throw new Error('WordPress omitted valid pagination totals');
    }
    const total = Number(totalHeader);
    const pages = Number(pagesHeader);
    if (!Number.isSafeInteger(total) || !Number.isSafeInteger(pages)) {
      throw new Error('WordPress omitted valid pagination totals');
    }
    const posts = await response.json();
    if (!Array.isArray(posts)) {
      throw new Error('WordPress posts response is not an array');
    }
    return { posts, total, pages };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPublishedPosts({
  apiUrl = DEFAULT_WORDPRESS_API_URL,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxPages = DEFAULT_MAX_PAGES,
} = {}) {
  const api = wordpressApiUrl(apiUrl);
  const posts = [];
  let expectedTotal;
  let expectedPages;

  for (let page = 1; page <= (expectedPages ?? 1); page += 1) {
    const url = new URL('posts', api);
    url.searchParams.set('status', 'publish');
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));
    url.searchParams.set('_embed', '1');
    const result = await fetchPage(url, fetchImpl, timeoutMs);
    if (page === 1) {
      expectedTotal = result.total;
      expectedPages = result.pages;
      if (expectedPages > maxPages) {
        throw new Error(`WordPress page limit exceeded: ${expectedPages} > ${maxPages}`);
      }
      if (expectedTotal > maxPages * 100 || (expectedTotal > 0 && expectedPages === 0)) {
        throw new Error('WordPress reported an invalid post count');
      }
    } else if (result.total !== expectedTotal || result.pages !== expectedPages) {
      throw new Error('WordPress pagination totals changed during the build');
    }
    posts.push(...result.posts);
    if (posts.length > expectedTotal) {
      throw new Error('WordPress returned more posts than its reported count');
    }
  }

  if (posts.length !== expectedTotal) {
    throw new Error(
      `Incomplete WordPress post count: received ${posts.length}, expected ${expectedTotal}`
    );
  }
  return posts;
}

export async function fetchPublishedPages({
  apiUrl = DEFAULT_WORDPRESS_API_URL,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const url = new URL('pages', wordpressApiUrl(apiUrl));
  url.searchParams.set('status', 'publish');
  url.searchParams.set('slug', PUBLIC_PAGE_SLUGS.join(','));
  url.searchParams.set('per_page', '100');
  const result = await fetchPage(url, fetchImpl, timeoutMs);
  if (result.posts.length !== result.total || (result.total > 0 && result.pages !== 1)) {
    throw new Error('Incomplete WordPress page response');
  }
  return result.posts;
}
