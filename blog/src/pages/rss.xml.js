import rss from '@astrojs/rss';

import { posts } from '../lib/snapshot.mjs';

export function GET(context) {
  return rss({
    title: 'Organized Glitter updates',
    description: 'News and notes from Organized Glitter.',
    site: context.site,
    items: posts.map(post => ({
      title: post.title,
      description: post.excerpt,
      pubDate: new Date(post.publishedAt),
      link: post.url,
    })),
    customData: '<language>en-us</language>',
  });
}
