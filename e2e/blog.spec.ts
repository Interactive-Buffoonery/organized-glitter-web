import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const wordpressOrigin = process.env.BLOG_QA_WORDPRESS_ORIGIN!;
const canonicalBase = 'https://site.example.test/updates/';
const empty = process.env.BLOG_QA_SCENARIO === 'empty';
const heroHeading = 'What’s new in Organized Glitter';
const heroImageAlt = 'A colorful illustration being filled in with pencils and markers';

test.describe('WordPress support pages', () => {
  test('renders static pages with safe links outside the post archive', async ({
    page,
    request,
  }) => {
    const response = await page.goto('/updates/privacy-policy/');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Privacy Policy', level: 1 })).toBeVisible();
    await expect(page.getByText('MailPoet manages the updates email list.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'All updates', exact: true })).toHaveCount(1);
    await expect(page.locator('.paper-tape')).toHaveCount(2);
    expect(
      await page.locator('h1').evaluate(el => parseFloat(getComputedStyle(el).fontSize))
    ).toBeLessThanOrEqual(40);
    await expect(page.getByRole('link', { name: 'Contact us' })).toHaveAttribute(
      'href',
      '/contact'
    );
    await expect(page.locator('script[data-unsafe-fixture]')).toHaveCount(0);
    await test
      .info()
      .attach('Privacy page', { body: await page.screenshot(), contentType: 'image/png' });
    await page.goto('/updates/subscription-confirmed/');
    await expect(
      page.getByRole('heading', { name: 'Thanks for subscribing!', level: 1 })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to updates' })).toHaveAttribute(
      'href',
      '/updates/'
    );
    await expect(
      page.getByRole('link', { name: 'Manage subscription on WordPress' })
    ).toHaveAttribute('href', /\?mailpoet_router/);
    await test.info().attach('Subscription confirmed page', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page.getByRole('link', { name: 'Back to updates' }).click();
    await expect(page).toHaveURL(/\/updates\/$/);
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toHaveCount(0);
    const rss = await (await request.get('/updates/rss.xml')).text();
    expect(rss).not.toContain('/subscription-confirmed/');
    expect(rss).not.toContain('/privacy-policy/');
    const sitemap = await (await request.get('/updates/sitemap.xml')).text();
    expect(sitemap).toContain(`${canonicalBase}privacy-policy/`);
    expect(sitemap).not.toContain('/subscription-confirmed/');
  });

  test('keeps the live contact form in an accessible frame with a direct fallback', async ({
    page,
  }) => {
    await page.route(`${wordpressOrigin}/contact/`, route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Contact fixture</title><form><label>Email <input type="email"></label><label>Message <textarea></textarea></label><button type="submit">Send message</button></form>',
      })
    );
    await page.goto('/contact');
    await expect(page.getByRole('heading', { name: 'Contact', level: 1 })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://site.example.test/contact'
    );
    const frame = page.getByTitle('Contact Organized Glitter');
    await expect(frame).toHaveAttribute('src', `${wordpressOrigin}/contact/`);
    const form = page.frameLocator('iframe[title="Contact Organized Glitter"]');
    await test
      .info()
      .attach('Contact page', { body: await page.screenshot(), contentType: 'image/png' });
    await form.getByLabel('Email').fill('reader@example.invalid');
    await form.getByLabel('Message').fill('A question about updates');
    await expect(form.getByRole('button', { name: 'Send message' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Open the contact form on WordPress' })
    ).toHaveAttribute('href', `${wordpressOrigin}/contact/`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false
    );
    await page.getByRole('link', { name: 'All updates' }).click();
    await expect(page).toHaveURL(/\/updates\/$/);
    await page.goto('/about');
    await expect(page.getByRole('link', { name: 'Send feedback', exact: true })).toHaveAttribute(
      'href',
      '/contact'
    );
  });
});

async function selectTheme(page: Page, name: 'Light' | 'Dark' | 'System') {
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}

async function waitForHeaderThemeSettled(page: Page) {
  await page.waitForFunction(() => {
    const header = document.querySelector('header[aria-label="Site header"]');
    return (
      header &&
      header.getAnimations({ subtree: true }).every(animation => animation.playState !== 'running')
    );
  });
}

function contrastRatio(foreground: string, background: string) {
  const luminance = (color: string) => {
    const channels = color
      .match(/[\d.]+/g)
      ?.slice(0, 3)
      .map(Number);
    if (!channels || channels.length !== 3) throw new Error(`Unsupported color: ${color}`);
    const linear = channels.map(channel => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

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

  test('features the latest real update with its local editorial date and working post link', async ({
    page,
  }) => {
    test.skip(empty, 'The empty archive has no update to feature');

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/updates/');

    const featured = page.locator('.featured-panel');
    const meta = featured.locator('.featured-meta');
    const copy = featured.locator('.featured-copy');
    const title = copy.getByRole('heading', { level: 3, name: 'A Glitter & Tea Update' });
    const titleLink = title.getByRole('link');
    const readLink = copy.getByRole('link', { name: 'Read update' });
    await expect(featured).toHaveCount(1);
    await expect(meta.getByText('Latest update')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Follow via RSS' })).toHaveCount(0);
    await expect(
      page.getByRole('contentinfo').getByRole('link', { name: 'RSS', exact: true })
    ).toHaveAttribute('href', '/updates/rss.xml');
    await expect(meta.locator('time')).toHaveText('Sept 27th');
    await expect(meta.locator('time')).toHaveAttribute('datetime', '2026-09-27');
    await expect(meta.getByText('01', { exact: true })).toHaveCount(0);
    await expect(titleLink).toHaveAttribute('href', '/updates/glitter-and-tea/');
    await expect(readLink).toHaveAttribute('href', '/updates/glitter-and-tea/');
    await expect(copy.getByText('News from the craft table.')).toBeVisible();
    await expect(title).toHaveCSS('font-family', /Caveat/);

    const titleSize = Number.parseFloat(
      await title.evaluate(element => getComputedStyle(element).fontSize)
    );
    const heroSize = Number.parseFloat(
      await page.locator('.hero-copy h1').evaluate(element => getComputedStyle(element).fontSize)
    );
    expect(titleSize).toBeGreaterThanOrEqual(28);
    expect(titleSize).toBeLessThanOrEqual(56);
    expect(titleSize).toBeLessThan(heroSize);

    const desktopMeta = await meta.boundingBox();
    const desktopCopy = await copy.boundingBox();
    expect(desktopMeta).not.toBeNull();
    expect(desktopCopy).not.toBeNull();
    expect(desktopMeta!.x + desktopMeta!.width).toBeLessThanOrEqual(desktopCopy!.x);
    await expect(page.locator('.post-list .post-summary')).toHaveCount(9);
    await expect(page.locator('.post-list').getByText('A Glitter & Tea Update')).toHaveCount(0);
    await expect(page.locator('.post-list').getByText('Needle Free Notes')).toBeVisible();

    await page.setViewportSize({ width: 375, height: 812 });
    const mobileMeta = await meta.boundingBox();
    const mobileCopy = await copy.boundingBox();
    expect(mobileMeta).not.toBeNull();
    expect(mobileCopy).not.toBeNull();
    expect(mobileMeta!.y + mobileMeta!.height).toBeLessThanOrEqual(mobileCopy!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      375
    );

    await readLink.click();
    await expect(page).toHaveURL(/\/updates\/glitter-and-tea\/$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'A Glitter & Tea Update' })
    ).toBeVisible();

    await page.goto('/updates/page/2/');
    await expect(page.locator('.featured-panel')).toHaveCount(0);
    await expect(page.locator('.post-list .post-summary')).toHaveCount(2);
    await expect(page.getByRole('link', { name: 'Newer posts' })).toHaveAttribute(
      'href',
      '/updates/'
    );
  });

  test('uses the public site header and a craft-focused hero', async ({ page }) => {
    await page.goto('/updates/');

    const header = page.getByRole('banner', { name: 'Site header' });
    await expect(header).toBeVisible();
    await expect(header.getByRole('link', { name: 'Organized Glitter home' })).toHaveAttribute(
      'href',
      '/'
    );
    await expect(header.getByRole('link', { name: 'Login' })).toHaveAttribute('href', '/login');
    await expect(header.getByRole('button', { name: 'Toggle theme' })).toBeVisible();
    await expect(header.getByRole('navigation')).toHaveCount(0);
    await expect(header.locator('.section-badge')).toHaveCount(0);
    if (test.info().project.name === 'blog-chromium') {
      await expect(header.getByRole('link', { name: 'Get Started' })).toHaveAttribute(
        'href',
        '/register'
      );
    }

    await expect(page.getByRole('heading', { level: 1, name: heroHeading })).toBeVisible();
    await expect(page.getByRole('img', { name: heroImageAlt })).toHaveAttribute(
      'src',
      '/images/marketing/coloring-in-progress.webp'
    );
    await expect(page.getByText('mystery coloring books are our favorite')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Subscribe to updates' })).toHaveAttribute(
      'href',
      /#subscribe$/
    );
    await expect(page.getByRole('link', { name: 'Visit the app' })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: 'Recent updates' })).toBeVisible();
  });

  test('lays out the email signup card beside its copy on desktop and stacks it on phones', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/updates/');

    const signup = page.locator('.subscribe-section');
    const copy = signup.locator('.subscribe-copy');
    const form = signup.locator('.subscribe-form');
    await expect(signup.getByRole('heading', { name: 'Want updates by email?' })).toBeVisible();
    await expect(
      signup.getByText('Subscribe to receive new Organized Glitter release notes by email.')
    ).toBeVisible();
    await expect(form.getByTitle('Subscribe to Organized Glitter updates')).toBeVisible();
    await expect(signup.getByText('Having trouble with the form?')).toHaveCount(0);
    await expect(signup.getByRole('link', { name: 'Subscribe on WordPress' })).toHaveCount(0);

    const desktopCopy = await copy.boundingBox();
    const desktopForm = await form.boundingBox();
    expect(desktopCopy).not.toBeNull();
    expect(desktopForm).not.toBeNull();
    expect(desktopCopy!.x + desktopCopy!.width).toBeLessThanOrEqual(desktopForm!.x);
    expect(desktopCopy!.y).toBeLessThan(desktopForm!.y + desktopForm!.height);
    expect(desktopForm!.y).toBeLessThan(desktopCopy!.y + desktopCopy!.height);

    await page.setViewportSize({ width: 375, height: 812 });
    const mobileCopy = await copy.boundingBox();
    const mobileForm = await form.boundingBox();
    expect(mobileCopy).not.toBeNull();
    expect(mobileForm).not.toBeNull();
    expect(mobileCopy!.y + mobileCopy!.height).toBeLessThanOrEqual(mobileForm!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      375
    );
  });

  test('keeps light, dark, and system themes across reloads', async ({ page }, testInfo) => {
    await page.goto('/updates/');
    const heroImage = page.getByRole('img', { name: heroImageAlt });
    await expect
      .poll(() => heroImage.evaluate(element => (element as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await page.evaluate(() => document.fonts.ready);
    await selectTheme(page, 'Light');
    await waitForHeaderThemeSettled(page);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('theme'))).toBe('light');
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.dataset.theme === 'light' ||
            document.documentElement.classList.contains('light')
        )
      )
      .toBe(true);
    const lightPath = testInfo.outputPath('blog-index-light.png');
    await page.screenshot({ path: lightPath, fullPage: true, animations: 'disabled' });
    await testInfo.attach('blog-index-light', { path: lightPath, contentType: 'image/png' });

    await selectTheme(page, 'Dark');
    await waitForHeaderThemeSettled(page);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.dataset.theme === 'dark' ||
            document.documentElement.classList.contains('dark')
        )
      )
      .toBe(true);
    const darkPath = testInfo.outputPath('blog-index-dark.png');
    await page.screenshot({ path: darkPath, fullPage: true, animations: 'disabled' });
    await testInfo.attach('blog-index-dark', { path: darkPath, contentType: 'image/png' });

    await page.reload();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.dataset.theme === 'dark' ||
            document.documentElement.classList.contains('dark')
        )
      )
      .toBe(true);

    await selectTheme(page, 'System');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('theme'))).toBe('system');
    await page.reload();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('theme'))).toBe('system');
  });

  test('keeps the reading surface accessible in light and dark themes', async ({ page }) => {
    test.skip(empty, 'The empty archive has no post card or paper link');

    await page.goto('/updates/');
    for (const theme of ['Light', 'Dark'] as const) {
      await selectTheme(page, theme);
      await waitForHeaderThemeSettled(page);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        );
      });
      const result = await new AxeBuilder({ page })
        .include('header[aria-label="Site header"]')
        .include('main')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(result.violations, `${theme} reading-surface accessibility violations`).toEqual([]);
    }
  });

  test('serves the current favicon on every public blog page', async ({ page, request }) => {
    const routes = [
      '/updates/',
      '/updates/privacy-policy/',
      '/updates/subscription-confirmed/',
      '/contact',
    ];
    if (!empty) routes.push('/updates/glitter-and-tea/');
    for (const route of routes) {
      await page.goto(route);
      const icon = page.locator('link[rel="icon"]').first();
      await expect(icon).toHaveAttribute('href', /^\/site-icon\.ico\?v=/);
      const response = await request.get((await icon.getAttribute('href'))!);
      expect(response.status()).toBe(200);
      expect([...(await response.body()).subarray(0, 4)]).toEqual([0, 0, 1, 0]);
      await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
        'href',
        /^\/site-touch-icon\.png\?v=/
      );
    }
  });

  test('keeps headings readable on paper in dark mode', async ({ page, isMobile }) => {
    await saveBlogSession(page, false, 'dark');
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
    const routes = ['/updates/privacy-policy/', '/updates/subscription-confirmed/'];
    if (!empty) routes.push('/updates/glitter-and-tea/');
    for (const route of routes) {
      await page.goto(route);
      await expect(
        page.getByRole('button', {
          name: isMobile ? 'Open account menu' : 'Account menu',
          exact: true,
        })
      ).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await page.evaluate(() => document.fonts.ready);
      const colors = await page.locator('.post-paper h1').evaluate(heading => ({
        text: getComputedStyle(heading).color,
        paper: getComputedStyle(heading.closest('.post-paper')!).backgroundColor,
      }));
      expect(
        contrastRatio(colors.text, colors.paper),
        `${route} dark heading contrast`
      ).toBeGreaterThanOrEqual(4.5);
      if (route === '/updates/glitter-and-tea/') {
        await test.info().attach('Dark article heading', {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
      }
    }
  });

  test('gives dark paper links a visible keyboard focus ring', async ({ page }) => {
    test.skip(
      empty || test.info().project.name !== 'blog-chromium',
      'Keyboard focus is checked with full posts in desktop Chromium'
    );

    await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
    const surfaces = [
      { path: '/updates/', link: '.featured-panel .read-link', surface: '.featured-panel' },
      { path: '/updates/', link: '.post-list .read-link', surface: '.post-list' },
      { path: '/updates/glitter-and-tea/', link: '.post-paper .back-link', surface: '.post-paper' },
      { path: '/updates/404.html', link: '.not-found .back-link', surface: '.not-found' },
    ];
    for (const { path, link, surface } of surfaces) {
      await page.goto(path);
      await page.keyboard.press('Tab');
      const target = page.locator(link).first();
      await target.focus();
      await expect(target).toHaveCSS('outline-style', 'solid');
      const colors = await target.evaluate((element, surfaceSelector) => {
        const ancestors: Element[] = [];
        for (
          let current = document.querySelector(surfaceSelector);
          current;
          current = current.parentElement
        ) {
          ancestors.unshift(current);
        }
        let background = [255, 255, 255];
        for (const ancestor of ancestors) {
          const channels = getComputedStyle(ancestor)
            .backgroundColor.match(/[\d.]+/g)
            ?.map(Number);
          if (!channels || channels.length < 3) continue;
          const alpha = channels[3] ?? 1;
          background = channels
            .slice(0, 3)
            .map((channel, index) => channel * alpha + background[index] * (1 - alpha));
        }
        return {
          ring: getComputedStyle(element).outlineColor,
          paper: `rgb(${background.join(',')})`,
        };
      }, surface);
      expect(
        contrastRatio(colors.ring, colors.paper),
        `${link} focus ring contrast`
      ).toBeGreaterThanOrEqual(3);
    }
  });

  test('renders a post without a featured image and reaches older posts', async ({ page }) => {
    test.skip(empty, 'The empty archive has no post journey');

    await page.goto('/updates/');
    await page.getByRole('heading', { name: 'Needle Free Notes' }).getByRole('link').click();
    await expect(page).toHaveURL(/\/updates\/needle-free-notes\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Needle Free Notes' })).toBeVisible();
    await expect(page.getByText('A post that has no featured image.')).toBeVisible();

    await page.goto('/updates/page/2/');
    await expect(page.getByRole('heading', { level: 1, name: 'Updates' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Older note 11' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Older note 12' })).toBeVisible();
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

  test('returns a real 404 for a removed post', async ({ page }) => {
    const response = await page.goto('/updates/removed-post/');
    expect(response?.status()).toBe(404);
  });

  test('keeps the generated blog 404 inside a padded reading wrapper', async ({ page }) => {
    const response = await page.goto('/updates/404.html');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('banner', { name: 'Site header' })).toBeVisible();
    const readingCard = page.locator('.not-found');
    await expect(
      readingCard.getByRole('heading', { level: 1, name: 'Page not found' })
    ).toBeVisible();
    await expect(readingCard.getByRole('link', { name: 'All updates' })).toHaveAttribute(
      'href',
      '/updates/'
    );
    const inset = await readingCard.evaluate(element => {
      const style = getComputedStyle(element);
      return {
        start: Number.parseFloat(style.paddingInlineStart),
        end: Number.parseFloat(style.paddingInlineEnd),
      };
    });
    expect(inset.start).toBeGreaterThanOrEqual(16);
    expect(inset.end).toBeGreaterThanOrEqual(16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width
    );
  });

  test('reserves header and footer space for device safe areas', async ({ page }) => {
    await page.goto('/updates/');
    const rules = await page.evaluate(() => {
      const collect = (ruleList: CSSRuleList): string[] =>
        Array.from(ruleList).flatMap(rule => {
          if (rule instanceof CSSStyleRule) {
            return /site-header|site-footer/.test(rule.selectorText) ? [rule.cssText] : [];
          }
          return rule instanceof CSSGroupingRule ? collect(rule.cssRules) : [];
        });
      return Array.from(document.styleSheets).flatMap(sheet => collect(sheet.cssRules));
    });
    const headerRules = rules.filter(rule => rule.includes('site-header')).join('\n');
    const footerRules = rules.filter(rule => rule.includes('site-footer')).join('\n');
    expect(headerRules).toContain('env(safe-area-inset-top)');
    expect(headerRules).toContain('env(safe-area-inset-left)');
    expect(headerRules).toContain('env(safe-area-inset-right)');
    expect(footerRules).toContain('env(safe-area-inset-bottom)');
  });

  test('wraps unbroken archive and post titles at phone width', async ({ page }) => {
    test.skip(empty, 'The empty archive has no post title');

    await page.setViewportSize({ width: 375, height: 812 });
    const unbrokenTitle = 'Coloring'.repeat(30);
    for (const { path, selector } of [
      { path: '/updates/', selector: '.featured-copy h3 a' },
      { path: '/updates/', selector: '.post-summary h3 a' },
      { path: '/updates/glitter-and-tea/', selector: '.post-heading h1' },
    ]) {
      await page.goto(path);
      await page
        .locator(selector)
        .first()
        .evaluate((element, title) => {
          element.textContent = title;
        }, unbrokenTitle);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        path
      ).toBeLessThanOrEqual(375);
    }
  });

  test('keeps the archive usable at phone width and with a keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/updates/');
    await expect(page.getByRole('heading', { level: 1, name: heroHeading })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Subscribe to updates' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Visit the app' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      375
    );

    if (test.info().project.name === 'blog-chromium') {
      await page.keyboard.press('Tab');
      await expect(page.locator(':focus-visible')).toHaveCount(1);
    }
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
        JSON.stringify({ exp: Math.floor(Date.now() / 1000) + (expired ? -60 : 3600), id: user.id })
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
  test('keeps static posts and provides the full shared account menu', async ({
    page,
    isMobile,
  }, testInfo) => {
    await saveBlogSession(page);
    await page.goto('/updates/');
    await expect(page.getByRole('heading', { level: 1, name: heroHeading })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Login', exact: true })).toBeHidden();
    if (isMobile) {
      await expect(page.getByRole('navigation', { name: 'Bottom navigation' })).toBeVisible();
      await expect(page.getByRole('contentinfo')).toBeHidden();
      await page.getByRole('button', { name: 'Open account menu', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Account menu' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Profile & settings' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Send feedback', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Close account menu' }).click();
    } else {
      await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
      await expect(page.getByRole('contentinfo')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Settings', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Account menu', exact: true }).click();
      await expect(page.getByRole('menuitem', { name: 'Send Feedback' })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Logout' })).toBeVisible();
      await page.keyboard.press('Escape');
    }
    if (!empty) {
      await page.getByRole('link', { name: 'A Glitter & Tea Update', exact: true }).first().click();
      await expect(page).toHaveURL(/\/updates\/glitter-and-tea\/$/);
      await expect(
        page.getByRole('heading', { level: 1, name: 'A Glitter & Tea Update' })
      ).toBeVisible();
      await expect(
        page.getByRole('button', {
          name: isMobile ? 'Open account menu' : 'Account menu',
          exact: true,
        })
      ).toBeVisible();
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflow).toBe(false);
    await testInfo.attach('Signed-in blog navigation', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });

  test('loads an app document when following shared navigation', async ({ page, isMobile }) => {
    await saveBlogSession(page);
    await page.route('**/profile', route =>
      route.fulfill({ contentType: 'text/html', body: '<h1>Settings destination</h1>' })
    );
    await page.goto('/updates/');
    if (isMobile) {
      await page.getByRole('button', { name: 'Open account menu', exact: true }).click();
      await page.getByRole('link', { name: 'Profile & settings' }).click();
    } else {
      await page.getByRole('link', { name: 'Settings', exact: true }).click();
    }
    await expect(page.getByRole('heading', { name: 'Settings destination' })).toBeVisible();
    await expect(page.getByRole('heading', { name: heroHeading })).toHaveCount(0);
  });

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

  test('keeps guest theme controls working after sign-out in another tab', async ({ page }) => {
    await saveBlogSession(page);
    await page.goto('/updates/');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('theme'))).toBe('light');
    await page.evaluate(() => {
      localStorage.removeItem('pocketbase_auth');
      dispatchEvent(
        new StorageEvent('storage', {
          key: 'pocketbase_auth',
          newValue: null,
          storageArea: localStorage,
        })
      );
    });
    await expect(page.getByRole('link', { name: 'Login', exact: true })).toBeVisible();
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(
      () =>
        new Promise(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)))
        )
    );
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await selectTheme(page, 'Dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('tracks repeated sign-out and sign-in in another tab without reloading navigation', async ({
    page,
    context,
    isMobile,
  }) => {
    await saveBlogSession(page);
    await page.goto('/updates/');
    const account = page.getByRole('button', {
      name: isMobile ? 'Open account menu' : 'Account menu',
      exact: true,
    });
    await expect(account).toBeVisible();
    const styles = await page.locator('link[rel="stylesheet"]').count();
    const otherTab = await context.newPage();
    try {
      await otherTab.goto('/updates/rss.xml');
      const savedSession = await otherTab.evaluate(() => localStorage.getItem('pocketbase_auth'));
      expect(savedSession).not.toBeNull();
      for (let attempt = 0; attempt < 2; attempt++) {
        await otherTab.evaluate(() => localStorage.removeItem('pocketbase_auth'));
        await expect(page.getByRole('link', { name: 'Login', exact: true })).toBeVisible();
        await expect(account).toHaveCount(0);
        await otherTab.evaluate(
          session => localStorage.setItem('pocketbase_auth', session!),
          savedSession
        );
        await expect(account).toBeVisible();
        await expect(page.getByRole('link', { name: 'Login', exact: true })).toBeHidden();
        await expect(page.locator('link[rel="stylesheet"]')).toHaveCount(styles);
      }
    } finally {
      await otherTab.close();
    }
  });

  test('keeps guest navigation for an expired session', async ({ page }) => {
    await saveBlogSession(page, true);
    await page.goto('/updates/');
    await expect(page.getByRole('link', { name: 'Login', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Bottom navigation' })).toHaveCount(0);
  });
});

test('fits MailPoet body margins without an inner scrollbar', async ({ page }) => {
  await page.route(`${wordpressOrigin}/?mailpoet_form_iframe=1`, route =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><style>form { height:152px; margin:0; } .error { height:80px; }</style>
      <form><label>Email <input type="email"></label><button>Subscribe</button></form>
      <script>function resize() { parent.postMessage({MailPoetIframeHeight: document.body.scrollHeight + 10 + 'px'}, '*'); }
      addEventListener('load', resize); new MutationObserver(resize).observe(document.body, {childList:true,subtree:true});</script>`,
    })
  );
  await page.goto('/updates/');
  const iframe = page.getByTitle('Subscribe to Organized Glitter updates');
  await iframe.scrollIntoViewIfNeeded();
  const body = page
    .frameLocator('iframe[title="Subscribe to Organized Glitter updates"]')
    .locator('body');
  await expect(iframe).toHaveCSS('height', '178px');
  expect(
    await body.evaluate(
      () => document.documentElement.scrollHeight > document.documentElement.clientHeight
    )
  ).toBe(false);
  await body.evaluate(body => {
    const error = document.createElement('p');
    error.className = 'error';
    error.textContent = 'Please enter a valid email address';
    body.append(error);
  });
  await expect
    .poll(() =>
      body.evaluate(
        () => document.documentElement.scrollHeight > document.documentElement.clientHeight
      )
    )
    .toBe(false);
  await expect(body.getByText('Please enter a valid email address')).toBeVisible();
});

test('keeps all website footer links usable at 320 pixels', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/about');
  const footer = page.getByRole('contentinfo');
  await footer.scrollIntoViewIfNeeded();
  await expect(footer.getByRole('link', { name: 'Source code' })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Updates', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
});
