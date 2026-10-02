import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizePages, normalizePosts } from '../src/lib/content.mjs';
import { fetchPublishedPages } from '../src/lib/wordpress.mjs';

const source = 'https://updates.organizedglitter.app';
const slugs = ['privacy-policy', 'subscription-confirmed'];
const pages = slugs.map((slug, index) => ({
  id: index + 1,
  type: 'page',
  status: 'publish',
  slug,
  link: `${source}/${slug}/`,
  title: { rendered: index ? 'Thanks for subscribing!' : 'Privacy Policy' },
  content: {
    rendered:
      '<p>WordPress content.</p><a href="/">Back to updates</a>' +
      '<a href="/contact/">Contact</a><a href="/?mailpoet_router&endpoint=unsubscribe">Unsubscribe</a>' +
      '<script>window.unsafePage = true</script>',
  },
}));

test('fetches only the selected published WordPress pages', async () => {
  const result = await fetchPublishedPages({
    apiUrl: `${source}/wp-json/wp/v2`,
    fetchImpl: async url => {
      assert.equal(url.pathname, '/wp-json/wp/v2/pages');
      assert.equal(url.searchParams.get('slug'), slugs.join(','));
      assert.equal(url.searchParams.get('status'), 'publish');
      return new Response(JSON.stringify(pages), {
        headers: { 'x-wp-total': '2', 'x-wp-totalpages': '1' },
      });
    },
  });
  assert.deepEqual(result, pages);
});

test('rejects incomplete page responses instead of publishing partial content', async () => {
  await assert.rejects(
    fetchPublishedPages({
      apiUrl: `${source}/wp-json/wp/v2`,
      fetchImpl: async () =>
        new Response(JSON.stringify([pages[0]]), {
          headers: { 'x-wp-total': '2', 'x-wp-totalpages': '1' },
        }),
    }),
    /incomplete/i
  );
  assert.throws(() => normalizePages([pages[0]], source), /missing/i);
});

test('sanitizes page content and keeps subscriber actions on WordPress', () => {
  const result = normalizePages(pages, source);
  assert.equal(result[0].url, '/updates/privacy-policy/');
  assert.match(result[0].html, /href="\/updates\/"/);
  assert.match(result[0].html, /href="\/contact"/);
  assert.match(result[0].html, /href="https:\/\/updates\.organizedglitter\.app\/\?mailpoet_router/);
  assert.doesNotMatch(result[0].html, /<script/);
});

test('rejects protected, unexpected, duplicate, and foreign pages', () => {
  for (const override of [
    { content: { rendered: '<p>Private</p>', protected: true } },
    { status: 'draft' },
    { type: 'post' },
    { slug: 'manage-subscription' },
    { link: 'https://other.example/privacy-policy/' },
    { link: `${source}/privacy-policy/?mailpoet_router` },
    { id: 0 },
  ]) {
    assert.throws(() => normalizePages([{ ...pages[0], ...override }, pages[1]], source));
  }
  assert.throws(() => normalizePages([pages[0], pages[0], pages[1]], source));
});

test('does not flatten live forms or MailPoet shortcodes into static pages', () => {
  for (const rendered of [
    '<form><input></form>',
    '[mailpoet_manage_subscription]',
    '<div class="wp-block-jetpack-contact-form">Form</div>',
  ]) {
    assert.throws(
      () => normalizePages([{ ...pages[0], content: { rendered } }, pages[1]], source),
      /dynamic/i
    );
  }
});

test('reserves support page paths so a post cannot overwrite them', () => {
  for (const slug of [...slugs, 'contact']) {
    assert.throws(() => normalizePosts([{ ...pages[0], slug, type: 'post' }], source), /reserved/i);
  }
});
