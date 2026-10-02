import http from 'node:http';

const firstPost = {
  id: 101,
  slug: 'glitter-and-tea',
  title: { rendered: 'A Glitter &amp; Tea Update' },
  excerpt: { rendered: '<p>News from the craft table.</p>' },
  content: {
    rendered:
      '<p>A safe paragraph with <em>emphasis</em>.</p>' +
      '<p><a href="/needle-free-notes/">Read Needle Free Notes</a></p>' +
      '<p><a href="javascript:alert(1)" onclick="alert(2)">Unsafe link</a></p>' +
      '<script data-unsafe-fixture>window.unsafeFixture = true</script>' +
      '<p><img src="https://content.example.test/wp-content/uploads/cover.svg" alt="A bright craft table"></p>',
  },
  featured_media: 501,
  _embedded: {
    'wp:featuredmedia': [
      {
        id: 501,
        source_url: 'https://content.example.test/wp-content/uploads/cover.svg',
        alt_text: 'A bright craft table',
        media_details: { width: 640, height: 360 },
      },
    ],
  },
};

const secondPost = {
  id: 102,
  slug: 'needle-free-notes',
  title: { rendered: 'Needle Free Notes' },
  excerpt: { rendered: '<p>A post that has no featured image.</p>' },
  content: { rendered: '<p>A post that has no featured image.</p>' },
  featured_media: 0,
};

const posts = [
  firstPost,
  secondPost,
  ...Array.from({ length: 10 }, (_, index) => ({
    id: 103 + index,
    slug: `older-note-${index + 3}`,
    title: { rendered: `Older note ${index + 3}` },
    excerpt: { rendered: `<p>Archive entry ${index + 3}.</p>` },
    content: { rendered: `<p>Archive entry ${index + 3}.</p>` },
    featured_media: 0,
  })),
].map((post, index) => ({
  ...post,
  type: 'post',
  status: 'publish',
  link: `/${post.slug}/`,
  date:
    index === 0
      ? '2026-09-27T23:30:00'
      : new Date(Date.UTC(2026, 8, 28 - index, 8)).toISOString().replace('.000Z', ''),
  date_gmt:
    index === 0
      ? '2026-09-28T03:30:00'
      : new Date(Date.UTC(2026, 8, 28 - index, 12)).toISOString().replace('.000Z', ''),
  modified_gmt:
    index === 0
      ? '2026-09-28T04:30:00'
      : new Date(Date.UTC(2026, 8, 28 - index, 13)).toISOString().replace('.000Z', ''),
}));

const cover =
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#ddc0dd"/><circle cx="320" cy="180" r="90" fill="#6d426d"/></svg>';

const pages = [
  {
    id: 14,
    slug: 'privacy-policy',
    title: { rendered: 'Privacy Policy' },
    content: {
      rendered:
        '<p>MailPoet manages the updates email list.</p><p><a href="/contact/">Contact us</a></p><script data-unsafe-fixture>window.unsafePage = true</script>',
    },
  },
  {
    id: 52,
    slug: 'subscription-confirmed',
    title: { rendered: 'Thanks for subscribing!' },
    content: {
      rendered:
        '<p>We will email you when we publish a new update.</p><a href="/">Back to updates</a><a href="/?mailpoet_router&endpoint=unsubscribe">Manage subscription on WordPress</a>',
    },
  },
];

export async function startWordPressFixture(scenario = 'full') {
  const fixturePosts = scenario === 'empty' ? [] : posts;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');

    if (url.pathname === '/wp-json/wp/v2/pages' && request.method === 'GET') {
      response.writeHead(200, {
        'Content-Type': 'application/json',
        'X-WP-Total': '2',
        'X-WP-TotalPages': '1',
      });
      response.end(
        JSON.stringify(
          pages.map(page => ({
            ...page,
            type: 'page',
            status: 'publish',
            link: `http://${request.headers.host}/${page.slug}/`,
          }))
        )
      );
      return;
    }

    if (url.pathname === '/media/cover.svg') {
      response.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      response.end(cover);
      return;
    }

    if (url.pathname !== '/wp-json/wp/v2/posts' || request.method !== 'GET') {
      response.writeHead(404);
      response.end();
      return;
    }

    const page = Number(url.searchParams.get('page') ?? 1);
    if (!Number.isInteger(page) || page < 1) {
      response.writeHead(400);
      response.end();
      return;
    }

    const totalPages = Math.ceil(fixturePosts.length / 10);
    if (page > totalPages && !(page === 1 && totalPages === 0)) {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ code: 'rest_post_invalid_page_number' }));
      return;
    }

    response.writeHead(200, {
      'Content-Type': 'application/json',
      'X-WP-Total': String(fixturePosts.length),
      'X-WP-TotalPages': String(totalPages),
    });
    response.end(
      JSON.stringify(
        fixturePosts.slice((page - 1) * 10, page * 10).map(post => ({
          ...post,
          link: `http://${request.headers.host}${post.link}`,
        }))
      )
    );
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No fixture port');
  return {
    url: `http://127.0.0.1:${address.port}/wp-json/wp/v2`,
    close: () =>
      new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve()))),
  };
}
