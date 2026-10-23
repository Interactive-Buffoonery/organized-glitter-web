import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import PocketBase from 'pocketbase';
import { randomUUID } from 'node:crypto';

import { assertLocalE2ETargets } from '../fixtures/local-safety';

const appUrl = process.env.E2E_APP_URL ?? 'http://localhost:3000';
const pocketBaseUrl = process.env.VITE_POCKETBASE_URL ?? 'http://localhost:8090';
const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const fixturePrefix = `Diamond URL ${randomUUID()}`;

const popupDiagnosticPrefix = '[pagination-popup]';

const paginationRouteValues = [
  ['page', '^\\d{1,6}$'],
  ['sort', '^(kit_name|created|updated|started|completed)$'],
  ['dir', '^(asc|desc)$'],
  ['drillShape', '^(round|square|all)$'],
  ['includeMiniKits', '^(true|false)$'],
  ['includeArchived', '^(true|false)$'],
];

function paginationRoute(rawUrl: string) {
  const url = new URL(rawUrl, appUrl);
  const pathname = ['/dashboard', '/login', '/'].includes(url.pathname)
    ? url.pathname
    : '[redacted]';
  const search = new URLSearchParams();
  for (const [key, pattern] of paginationRouteValues) {
    const value = url.searchParams.get(key);
    if (value !== null) search.set(key, new RegExp(pattern).test(value) ? value : '[redacted]');
  }
  return { pathname, search: search.toString() };
}

async function startPopupDiagnostics(page: Page, context: BrowserContext) {
  const startedAt = Date.now();
  const events: unknown[] = [];
  const record = (event: string, detail: object = {}) => {
    if (events.length === 60) events.shift();
    events.push({ ms: Date.now() - startedAt, event, ...detail });
  };
  const observePage = (observed: Page, id: number) => {
    record('page-observed', { id, ...paginationRoute(observed.url()) });
    observed.on('framenavigated', frame => {
      if (frame === observed.mainFrame()) {
        record('navigation', { id, ...paginationRoute(frame.url()) });
      }
    });
    for (const event of ['domcontentloaded', 'load', 'close', 'crash'] as const) {
      observed.on(event, () => record(event, { id }));
    }
    observed.on('popup', () => record('popup', { id }));
  };
  // Chromium-level tab events tell a tab Chromium never created apart from one
  // Playwright never surfaced as a page.
  const browser = context.browser();
  const targetSession =
    browser?.browserType().name() === 'chromium' ? await browser.newBrowserCDPSession() : undefined;
  let pageContextId: string | undefined;
  if (targetSession) {
    const pageSession = await context.newCDPSession(page);
    pageContextId = (await pageSession.send('Target.getTargetInfo')).targetInfo.browserContextId;
    await pageSession.detach();
  }
  const safeTarget = (target: {
    type: string;
    attached: boolean;
    openerId?: string;
    browserContextId?: string;
    url: string;
  }) => ({
    type: target.type,
    attached: target.attached,
    opener: Boolean(target.openerId),
    sameContext: target.browserContextId === pageContextId,
    ...paginationRoute(target.url || 'about:blank'),
  });
  let discoveringExistingTargets = true;
  targetSession?.on('Target.targetCreated', ({ targetInfo }) => {
    if (!discoveringExistingTargets && targetInfo.type === 'page') {
      record('target-created', safeTarget(targetInfo));
    }
  });
  targetSession?.on('Target.targetInfoChanged', ({ targetInfo }) => {
    if (targetInfo.type === 'page') record('target-changed', safeTarget(targetInfo));
  });
  targetSession?.on('Target.targetCrashed', () => record('target-crashed'));
  targetSession?.on('Target.targetDestroyed', () => record('target-destroyed'));
  await targetSession?.send('Target.setDiscoverTargets', { discover: true });
  discoveringExistingTargets = false;

  let pageCount = 1;
  observePage(page, 0);
  context.on('page', newPage => {
    record('context-page');
    observePage(newPage, pageCount++);
  });
  page.on('console', message => {
    if (message.type() === 'debug' && message.text().startsWith(popupDiagnosticPrefix)) {
      record('input', JSON.parse(message.text().slice(popupDiagnosticPrefix.length)));
    }
  });
  const initialState = await page.evaluate(
    ({ prefix, routeSource }) => {
      const safeRoute = (href: string) => {
        const url = new URL(href, location.href);
        const search = new URLSearchParams();
        for (const [key, pattern] of routeSource) {
          const value = url.searchParams.get(key);
          if (value !== null) {
            search.set(key, new RegExp(pattern).test(value) ? value : '[redacted]');
          }
        }
        return {
          pathname: url.pathname === '/dashboard' ? url.pathname : '[redacted]',
          search: search.toString(),
        };
      };
      const snapshot = (anchor: HTMLAnchorElement | null) =>
        anchor && {
          href: safeRoute(anchor.href),
          disabled: anchor.getAttribute('aria-disabled') === 'true',
          connected: anchor.isConnected,
          current: safeRoute(location.href),
        };
      let inputCount = 0;
      for (const type of [
        'pointerdown',
        'mousedown',
        'mouseup',
        'click',
        'auxclick',
        'contextmenu',
      ]) {
        window.addEventListener(
          type,
          event => {
            if (!(event instanceof MouseEvent) || !(event.target instanceof Element)) return;
            const anchor = event.target.closest<HTMLAnchorElement>(
              'a[aria-label="Go to next page"]'
            );
            if (!anchor || inputCount++ >= 12) return;
            const input = {
              type,
              trusted: event.isTrusted,
              button: event.button,
              ctrl: event.ctrlKey,
              meta: event.metaKey,
              shift: event.shiftKey,
              alt: event.altKey,
              atCapture: snapshot(anchor),
            };
            console.debug(
              prefix +
                JSON.stringify({
                  ...input,
                  phase: 'capture',
                  defaultPrevented: event.defaultPrevented,
                })
            );
            setTimeout(() => {
              console.debug(
                prefix +
                  JSON.stringify({
                    ...input,
                    phase: 'after-dispatch',
                    defaultPrevented: event.defaultPrevented,
                    afterDispatch: snapshot(anchor),
                  })
              );
            }, 0);
          },
          { capture: true, passive: true }
        );
      }
      return {
        platform: navigator.platform,
        link: snapshot(
          document.querySelector<HTMLAnchorElement>('a[aria-label="Go to next page"]')
        ),
      };
    },
    {
      prefix: popupDiagnosticPrefix,
      routeSource: paginationRouteValues,
    }
  );
  const report = async (failed: boolean) => {
    const browserTargets = failed
      ? await targetSession
          ?.send('Target.getTargets')
          .then(({ targetInfos }) =>
            targetInfos.filter(target => target.type === 'page').map(safeTarget)
          )
          .catch(() => 'unavailable')
      : undefined;
    await targetSession?.detach().catch(() => undefined);
    if (!failed) return;
    console.warn(
      popupDiagnosticPrefix,
      JSON.stringify({
        browser: context.browser()?.version(),
        hostPlatform: process.platform,
        initialState,
        pages: context
          .pages()
          .slice(0, 5)
          .map(openPage => ({ closed: openPage.isClosed(), ...paginationRoute(openPage.url()) })),
        browserTargets,
        events,
      })
    );
  };
  return { record, report };
}

test.use({ serviceWorkers: 'block', trace: 'on', video: 'on' });

test.describe('diamond pagination shared URL', () => {
  test.setTimeout(180_000);

  let popupDiagnostics: Awaited<ReturnType<typeof startPopupDiagnostics>> | undefined;
  test.afterEach(async ({ page }, testInfo) => {
    popupDiagnostics?.record('test-ended', {
      status: testInfo.status,
      closed: page.isClosed(),
      ...paginationRoute(page.url()),
    });
    await popupDiagnostics?.report(testInfo.status !== testInfo.expectedStatus);
    popupDiagnostics = undefined;
  });

  let pb: PocketBase;
  const projectIds: string[] = [];
  const archivedTitle = `${fixturePrefix} ZZZ Archived`;

  test.beforeAll(async () => {
    assertLocalE2ETargets({ appUrl, pocketBaseUrl, specName: 'Diamond pagination URL' });
    if (!email || !password) throw new Error('Missing local E2E credentials.');

    pb = new PocketBase(pocketBaseUrl);
    await pb.collection('users').authWithPassword(email, password);
    const userId = pb.authStore.record?.id;
    if (!userId) throw new Error('Missing authenticated fixture user.');

    for (let index = 1; index <= 51; index++) {
      const title = `${fixturePrefix} ${String(index).padStart(2, '0')}`;
      const record = await pb.collection('projects').create<{ id: string }>({
        user: userId,
        title,
        title_sort: title.toLowerCase(),
        status: 'stash',
        drill_shape: 'round',
        kit_category: 'full',
      });
      projectIds.push(record.id);
    }
    const archived = await pb.collection('projects').create<{ id: string }>({
      user: userId,
      title: archivedTitle,
      title_sort: archivedTitle.toLowerCase(),
      status: 'archived',
      drill_shape: 'round',
      kit_category: 'full',
    });
    projectIds.push(archived.id);
  });

  test.afterAll(async () => {
    if (!pb) return;
    for (const id of projectIds) {
      await pb.collection('projects').delete(id);
    }
  });

  test('modified click and history preserve sort and panel filters', async ({ page, context }) => {
    await page.goto('/dashboard');
    await page.getByRole('combobox', { name: 'Drill Shape' }).click();
    await page.getByRole('option', { name: 'Round' }).click();
    await page.getByRole('checkbox', { name: 'Mini Kits' }).uncheck();
    await page.getByRole('checkbox', { name: 'Archived Kits' }).check();
    await page.getByRole('button', { name: /^Sort projects/ }).click();
    await page.getByRole('radio', { name: /Kit Name \(A → Z\)/ }).click();

    await expect(page.getByRole('link', { name: '1', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await page.getByRole('link', { name: 'Go to next page' }).click();
    await expect(page.getByRole('link', { name: '2', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(
      page.getByRole('button', { name: `Open project ${fixturePrefix} 26` })
    ).toBeVisible();

    const next = page.getByRole('link', { name: 'Go to next page' });
    const destination = new URL(await next.getAttribute('href')!, appUrl);
    expect(destination.searchParams.get('sort')).toBe('kit_name');
    expect(destination.searchParams.get('dir')).toBe('asc');
    expect(destination.searchParams.get('drillShape')).toBe('round');
    expect(destination.searchParams.get('includeMiniKits')).toBe('false');
    expect(destination.searchParams.get('includeArchived')).toBe('true');
    expect(destination.searchParams.get('page')).toBe('3');

    popupDiagnostics = await startPopupDiagnostics(page, context);
    const newTabEvent = context.waitForEvent('page');
    await next.click({ modifiers: ['ControlOrMeta'] });
    popupDiagnostics.record('modified-click-completed');
    const newTab = await newTabEvent;
    await expect(
      newTab.getByRole('button', { name: `Open project ${archivedTitle}` })
    ).toBeVisible();
    await expect(newTab.getByText('Sorted by Kit Name (A → Z)')).toBeVisible();
    await expect(newTab.getByRole('checkbox', { name: 'Archived Kits' })).toBeChecked();
    await expect(newTab.getByRole('checkbox', { name: 'Mini Kits' })).not.toBeChecked();

    await next.click();
    await expect(page.getByRole('button', { name: `Open project ${archivedTitle}` })).toBeVisible();
    const pageThreeUrl = page.url();
    await page.getByRole('button', { name: 'Diamond paintings' }).click();
    await expect(page).toHaveURL(pageThreeUrl);
    await expect(page.getByRole('button', { name: `Open project ${archivedTitle}` })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('link', { name: '2', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(
      page.getByRole('button', { name: `Open project ${fixturePrefix} 26` })
    ).toBeVisible();
    await page.goForward();
    await expect(page.getByRole('button', { name: `Open project ${archivedTitle}` })).toBeVisible();
    await expect(page.getByText('Sorted by Kit Name (A → Z)')).toBeVisible();
  });

  test('deep-search shared high page returns to the last real page', async ({ page }) => {
    const lastPageRequested = Promise.withResolvers<void>();
    const resumeLastPage = Promise.withResolvers<void>();
    await page.route('**/api/collections/projects/records?**', async route => {
      if (new URL(route.request().url()).searchParams.get('page') === '3') {
        lastPageRequested.resolve();
        await resumeLastPage.promise;
      }
      await route.continue();
    });

    const params = new URLSearchParams({
      search: fixturePrefix,
      searchAllFields: 'true',
      includeArchived: 'true',
      sort: 'kit_name',
      dir: 'asc',
      page: '999',
    });

    try {
      await page.goto(`/dashboard?${params}`);
      await lastPageRequested.promise;
      await expect(page).toHaveURL(/page=3(?:&|$)/);
      await expect(page.getByRole('region', { name: 'Project results' })).toHaveCount(0);
    } finally {
      resumeLastPage.resolve();
    }

    await expect(page.getByRole('button', { name: `Open project ${archivedTitle}` })).toBeVisible();
  });
});
