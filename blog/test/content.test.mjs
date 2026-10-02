import assert from 'node:assert/strict';
import test from 'node:test';

import { mailpoetIframeUrl, normalizePosts, sanitizePostHtml } from '../src/lib/content.mjs';
import { formatEditorialDate, formatFeaturedDate } from '../src/lib/dates.mjs';
import { fetchPublishedPosts } from '../src/lib/wordpress.mjs';

const source = 'https://updates.organizedglitter.app';

function post(overrides = {}) {
  return {
    id: 91,
    type: 'post',
    status: 'publish',
    slug: 'welcome-to-organized-glitter-updates',
    link: `${source}/welcome-to-organized-glitter-updates/`,
    date: '2026-09-27T11:30:04',
    date_gmt: '2026-09-27T15:30:04',
    modified_gmt: '2026-09-27T15:30:04',
    title: { rendered: 'Welcome to Organized Glitter&#8217;s Updates' },
    excerpt: { rendered: '<p>Hello, and welcome.</p>' },
    content: { rendered: '<p>Hello, and welcome to Organized Glitter&#8217;s updates blog!</p>' },
    featured_media: 0,
    ...overrides,
  };
}

function response(posts, total, pages, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'x-wp-total': String(total), 'x-wp-totalpages': String(pages) }),
    json: async () => posts,
  };
}

test('fetches every published page with a bounded page size and stable totals', async () => {
  const second = post({
    id: 92,
    slug: 'another-post',
    link: `${source}/another-post/`,
  });
  const requested = [];
  const fetchImpl = async url => {
    const parsed = new URL(url);
    requested.push(parsed);
    return Number(parsed.searchParams.get('page')) === 1
      ? response([post()], 2, 2)
      : response([second], 2, 2);
  };

  const posts = await fetchPublishedPosts({
    apiUrl: `${source}/wp-json/wp/v2`,
    fetchImpl,
  });

  assert.equal(posts.length, 2);
  assert.deepEqual(
    requested.map(url => [
      url.searchParams.get('status'),
      url.searchParams.get('per_page'),
      url.searchParams.get('page'),
    ]),
    [
      ['publish', '100', '1'],
      ['publish', '100', '2'],
    ]
  );
  assert.ok(requested.every(url => url.pathname.endsWith('/posts')));
});

test('rejects a partial response instead of publishing a stale or incomplete set', async () => {
  await assert.rejects(
    fetchPublishedPosts({
      apiUrl: `${source}/wp-json/wp/v2`,
      fetchImpl: async () => response([post()], 2, 2),
      maxPages: 1,
    }),
    /page limit/i
  );

  let page = 0;
  await assert.rejects(
    fetchPublishedPosts({
      apiUrl: `${source}/wp-json/wp/v2`,
      fetchImpl: async () => {
        page += 1;
        return page === 1 ? response([post()], 2, 2) : response([], 2, 2);
      },
    }),
    /count|incomplete/i
  );
});

test('rejects missing or malformed pagination headers even for an empty archive', async () => {
  for (const headers of [
    new Headers(),
    new Headers({ 'x-wp-total': '0' }),
    new Headers({ 'x-wp-total': 'NaN', 'x-wp-totalpages': '0' }),
  ]) {
    await assert.rejects(
      fetchPublishedPosts({
        apiUrl: `${source}/wp-json/wp/v2`,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          headers,
          json: async () => [],
        }),
      }),
      /pagination totals/i
    );
  }
});

test('rejects non-public posts and duplicate URL slugs', () => {
  assert.throws(() => normalizePosts([post({ status: 'draft' })], source), /published/i);
  assert.throws(() => normalizePosts([post(), post({ id: 92 })], source), /duplicate/i);
  for (const slug of ['page', 'rss.xml', 'sitemap.xml', '_astro']) {
    assert.throws(
      () => normalizePosts([post({ slug, link: `${source}/${slug}/` })], source),
      /reserved/i
    );
  }
});

test('excludes password-protected published posts and their permalinks', () => {
  const protectedPost = post({
    id: 92,
    slug: 'private-news',
    link: `${source}/private-news/`,
    password: 'hidden',
    content: { rendered: '<p>Secret text</p>', protected: true },
  });
  const [publicPost] = normalizePosts(
    [post({ content: { rendered: '<a href="/private-news/">Private link</a>' } }), protectedPost],
    source
  );
  assert.equal(
    publicPost.html,
    '<a href="https://updates.organizedglitter.app/private-news/">Private link</a>'
  );
  assert.equal(normalizePosts([protectedPost], source).length, 0);
});

test('decodes WordPress text fields and rejects post URLs outside the source host', () => {
  const [normalized] = normalizePosts([post()], source);
  assert.equal(normalized.title, 'Welcome to Organized Glitter’s Updates');
  assert.equal(normalized.excerpt, 'Hello, and welcome.');
  assert.equal(normalized.url, '/updates/welcome-to-organized-glitter-updates/');
  assert.equal(normalized.publishedAt, '2026-09-27T15:30:04.000Z');
  assert.equal(normalized.displayDate, '2026-09-27');
  assert.throws(
    () =>
      normalizePosts(
        [post({ link: 'https://example.com/welcome-to-organized-glitter-updates/' })],
        source
      ),
    /source host/i
  );
});

test('shows the WordPress editorial day for evening posts across DST and winter', () => {
  const evening = post({
    date: '2026-09-27T23:30:00',
    date_gmt: '2026-09-28T03:30:00',
  });
  const winter = post({
    id: 92,
    slug: 'winter-evening',
    link: `${source}/winter-evening/`,
    date: '2026-12-15T23:30:00',
    date_gmt: '2026-12-16T04:30:00',
  });
  const normalized = normalizePosts([evening, winter], source);
  assert.equal(normalized[0].slug, 'winter-evening');
  assert.equal(normalized[0].publishedAt, '2026-12-16T04:30:00.000Z');
  assert.equal(normalized[0].displayDate, '2026-12-15');
  assert.equal(formatEditorialDate(normalized[0].displayDate), 'December 15, 2026');
  assert.equal(normalized[1].displayDate, '2026-09-27');
  assert.equal(formatEditorialDate(normalized[1].displayDate), 'September 27, 2026');
});

test('formats short featured dates with correct month and ordinal endings', () => {
  assert.equal(formatFeaturedDate('2026-09-27'), 'Sept 27th');
  assert.equal(formatFeaturedDate('2026-01-11'), 'Jan 11th');
  assert.equal(formatFeaturedDate('2026-01-12'), 'Jan 12th');
  assert.equal(formatFeaturedDate('2026-01-13'), 'Jan 13th');
  assert.equal(formatFeaturedDate('2026-01-21'), 'Jan 21st');
  assert.equal(formatFeaturedDate('2026-05-01'), 'May 1st');
});

test('rejects missing or impossible WordPress editorial dates', () => {
  for (const date of [undefined, '2026-02-30T09:00:00', '2026-12-15T24:00:00']) {
    assert.throws(() => normalizePosts([post({ date })], source), /invalid date/i);
  }
});

test('strips active WordPress HTML and rewrites only known post links', () => {
  const links = new Map([
    [
      `${source}/welcome-to-organized-glitter-updates/`,
      '/updates/welcome-to-organized-glitter-updates/',
    ],
  ]);
  const html = [
    '<p onclick="alert(1)">A <a href="/welcome-to-organized-glitter-updates/?ref=email#part">post</a>.</p>',
    '<p><a href="/wp-admin/">Admin</a> <a href="/wp-json/wp/v2/posts">API</a> <a href="mailto:hello@example.com">Mail</a></p>',
    '<p><a href="/mailpoet/?mailpoet_router&endpoint=track">Email link</a> <a href="/welcome-to-organized-glitter-updates/?mailpoet_router&endpoint=track">Post action</a></p>',
    '<img src="/wp-content/uploads/photo.jpg" alt="Project photo" onerror="alert(1)">',
    '<a href="javascript:alert(1)">bad</a><script>alert(1)</script><iframe src="https://evil.example"></iframe>',
  ].join('');

  const result = sanitizePostHtml(html, { sourceOrigin: source, postLinks: links });
  assert.match(result, /href="\/updates\/welcome-to-organized-glitter-updates\/\?ref=email#part"/);
  assert.match(result, /href="https:\/\/updates\.organizedglitter\.app\/wp-admin\/"/);
  assert.match(result, /href="https:\/\/updates\.organizedglitter\.app\/wp-json\/wp\/v2\/posts"/);
  assert.match(result, /href="mailto:hello@example\.com"/);
  assert.match(
    result,
    /href="https:\/\/updates\.organizedglitter\.app\/mailpoet\/\?mailpoet_router&amp;endpoint=track"/
  );
  assert.match(
    result,
    /href="https:\/\/updates\.organizedglitter\.app\/welcome-to-organized-glitter-updates\/\?mailpoet_router&amp;endpoint=track"/
  );
  assert.match(
    result,
    /src="https:\/\/updates\.organizedglitter\.app\/wp-content\/uploads\/photo\.jpg"/
  );
  assert.doesNotMatch(result, /onclick|onerror|javascript:|<script|<iframe|evil\.example/i);
});

test('does not preserve HTTP loopback links from the public WordPress source', () => {
  const html = sanitizePostHtml('<a href="http://localhost:9090/private">private</a>', {
    sourceOrigin: source,
    postLinks: new Map(),
  });
  assert.doesNotMatch(html, /href=/);
});

test('requires featured media metadata when WordPress declares featured media', () => {
  assert.throws(() => normalizePosts([post({ featured_media: 123 })], source), /featured media/i);
});

test('accepts a loopback fixture while rejecting insecure remote content', () => {
  const local = 'http://127.0.0.1:4321';
  const [normalized] = normalizePosts(
    [
      post({
        link: `${local}/welcome-to-organized-glitter-updates/`,
        content: { rendered: '<img src="/media/cover.svg" alt="Cover">' },
      }),
    ],
    local
  );
  assert.match(normalized.html, /src="http:\/\/127\.0\.0\.1:4321\/media\/cover\.svg"/);
  assert.throws(() => normalizePosts([], 'http://remote.example'), /HTTPS/i);
});

test('accepts the confirmed MailPoet frame only from the source origin', () => {
  assert.equal(
    mailpoetIframeUrl(`${source}/?mailpoet_form_iframe=1`, source),
    `${source}/?mailpoet_form_iframe=1`
  );
  assert.throws(() => mailpoetIframeUrl('https://evil.example/form', source), /source host/i);
  assert.throws(
    () => mailpoetIframeUrl(`${source}/?mailpoet_form_iframe=1`, 'http://127.0.0.1:4321'),
    /source host/
  );
});
