import { expect, test, type Page } from '@playwright/test';

const wordpressOrigin = process.env.BLOG_QA_WORDPRESS_ORIGIN!;
const canonicalBase = 'https://site.example.test/updates/';
const empty = process.env.BLOG_QA_SCENARIO === 'empty';
const heroHeading = 'What’s new in Organized Glitter';

test.beforeEach(async ({ page }) => {
  await page.route('https://content.example.test/wp-content/uploads/cover.svg', route =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#ddc0dd"/></svg>',
    })
  );
});

test.describe('static updates archive', () => {
  test('shows published posts, paging, and a working return path', async ({ page }) => {
    test.skip(empty, 'The empty archive has no post journey');

    const indexResponse = await page.goto('/updates/');
    expect(indexResponse?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: heroHeading })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Recent updates' })).toBeVisible();

    const postLink = page
      .getByRole('heading', { name: 'A Glitter & Tea Update' })
      .getByRole('link');
    await expect(postLink).toBeVisible();
    await postLink.click();
    await expect(page).toHaveURL(/\/updates\/glitter-and-tea\/$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'A Glitter & Tea Update' })
    ).toBeVisible();
    await expect(page.getByText('A safe paragraph with emphasis.')).toBeVisible();
    const image = page.getByRole('img', { name: 'A bright craft table' }).first();
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await expect(page.getByRole('link', { name: 'All updates' }).first()).toBeVisible();

    await page.getByRole('link', { name: 'All updates' }).first().click();
    await expect(page).toHaveURL(/\/updates\/$/);
    await expect(page.getByRole('heading', { level: 1, name: heroHeading })).toBeVisible();
  });

  test('escapes unsafe source content and publishes metadata feeds', async ({ page, request }) => {
    test.skip(empty, 'The empty archive has no post journey');

    await page.goto('/updates/glitter-and-tea/');
    await expect(page.locator('script[data-unsafe-fixture]')).toHaveCount(0);
    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
    await expect(page.locator('a[onclick]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Read Needle Free Notes' })).toHaveAttribute(
      'href',
      '/updates/needle-free-notes/'
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${canonicalBase}glitter-and-tea/`
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      /A Glitter & Tea Update/
    );

    const rss = await request.get('/updates/rss.xml');
    expect(rss.status()).toBe(200);
    expect(rss.headers()['content-type']).toContain('xml');
    expect(await rss.text()).toContain(`${canonicalBase}glitter-and-tea/`);

    const sitemap = await request.get('/updates/sitemap.xml');
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain(`${canonicalBase}glitter-and-tea/`);
  });

  test('loads the approved signup frame and accepts resize messages only from it', async ({
    page,
  }) => {
    await page.route(`${wordpressOrigin}/?mailpoet_form_iframe=1`, route =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body:
          '<!doctype html><title>MailPoet fixture</title><form><label>Email <input type="email"></label></form>' +
          '<script>parent.postMessage({ MailPoetIframeHeight: "412px" }, "*")</script>',
      })
    );
    await page.goto('/updates/');

    const iframe = page.getByTitle('Subscribe to Organized Glitter updates');
    await iframe.scrollIntoViewIfNeeded();
    await expect(iframe).toHaveAttribute('src', `${wordpressOrigin}/?mailpoet_form_iframe=1`);
    await expect(iframe).toHaveCSS('height', '428px');
    await page.evaluate(() => {
      window.postMessage({ MailPoetIframeHeight: '1000px' }, '*');
    });
    await expect(iframe).toHaveCSS('height', '428px');

    const frame = page.frameLocator('iframe[title="Subscribe to Organized Glitter updates"]');
    const nestedOrigin = await frame.locator('body').evaluate(async body => {
      window.parent.postMessage({ MailPoetIframeHeight: 'not-a-height' }, '*');
      const nested = document.createElement('iframe');
      nested.srcdoc = '<script>top.postMessage({ MailPoetIframeHeight: "900px" }, "*")</script>';
      const loaded = new Promise<void>(resolve => nested.addEventListener('load', () => resolve()));
      body.append(nested);
      await loaded;
      await new Promise(resolve => setTimeout(resolve, 50));
      return nested.contentWindow?.origin;
    });
    expect(nestedOrigin).toBe(wordpressOrigin);
    await expect(iframe).toHaveCSS('height', '428px');

    await frame.locator('body').evaluate(() => {
      window.parent.postMessage({ MailPoetIframeHeight: '180px' }, '*');
    });
    await expect(iframe).toHaveCSS('height', '196px');
    await frame.locator('body').evaluate(() => {
      window.parent.postMessage({ MailPoetIframeHeight: '119px' }, '*');
    });
    await expect(iframe).toHaveCSS('height', '196px');
  });

  test('shows an understandable empty archive', async ({ page }) => {
    test.skip(!empty, 'Only the empty fixture build has no posts');

    const response = await page.goto('/updates/');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: heroHeading })).toBeVisible();
    await expect(page.getByText('No updates have been published yet.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Subscribe to updates' })).toBeVisible();
  });
});

async function saveBlogSession(page: Page, expired = false, themePreference = 'light') {
  const user = {
    id: 'blogtestuser001',
    collectionName: 'users',
    collectionId: '_pb_users_auth_',
    email: 'blog-reader@example.invalid',
    name: 'Blog reader',
    verified: true,
    theme_preference: themePreference,
    avatar: '',
  };
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    const body = url.pathname.endsWith(`/users/records/${user.id}`)
      ? user
      : { page: 1, perPage: 30, totalItems: 0, totalPages: 0, items: [] };
    return route.fulfill({ status: 200, json: body });
  });
  await page.addInitScript(
    ({ user, expired }) => {
      if (sessionStorage.getItem('blog-session-initialized')) return;
      sessionStorage.setItem('blog-session-initialized', 'true');
      const payload = btoa(
        JSON.stringify({
          exp: Math.floor(Date.now() / 1000) + (expired ? -60 : 7 * 24 * 3600),
          id: user.id,
        })
      );
      localStorage.setItem(
        'pocketbase_auth',
        JSON.stringify({ token: `e30.${payload}.fixture`, record: user })
      );
    },
    { user, expired }
  );
}

test.describe('signed-in blog navigation', () => {
  test('uses shared logout and returns to guest navigation', async ({ page, isMobile }) => {
    await saveBlogSession(page);
    await page.route('**/login', route =>
      route.fulfill({ contentType: 'text/html', body: '<h1>Login destination</h1>' })
    );
    await page.goto('/updates/');
    await page
      .getByRole('button', { name: isMobile ? 'Open account menu' : 'Account menu', exact: true })
      .click();
    await page.getByRole(isMobile ? 'button' : 'menuitem', { name: 'Logout', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Login destination' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('pocketbase_auth'))).toBeNull();
    await page.goto('/updates/');
    await expect(page.getByRole('link', { name: 'Login', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Bottom navigation' })).toHaveCount(0);
    await expect(page.getByRole('contentinfo')).toBeVisible();
  });

  test('keeps guest navigation for an expired session', async ({ page }) => {
    await saveBlogSession(page, true);
    await page.goto('/updates/');
    await expect(page.getByRole('link', { name: 'Login', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Bottom navigation' })).toHaveCount(0);
  });
});
