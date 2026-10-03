import { pageCount, pages, posts } from '../lib/snapshot.mjs';

import { siteOrigin as site } from '../lib/deployment.mjs';

function escapeXml(value) {
  return value.replace(
    /[<>&"']/g,
    character =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;',
      })[character]
  );
}

export function GET() {
  const urls = ['/updates/'];
  for (let page = 2; page <= pageCount; page += 1) urls.push(`/updates/page/${page}/`);
  urls.push(...posts.map(post => post.url));
  urls.push(...pages.filter(page => page.slug !== 'subscription-confirmed').map(page => page.url));
  urls.push('/contact');
  const entries = urls.map(
    path => `  <url><loc>${escapeXml(new URL(path, site).href)}</loc></url>`
  );
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
  ].join('\n');
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
