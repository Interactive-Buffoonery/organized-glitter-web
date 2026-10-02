import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';
import { libraryPageHeading } from '../libraryPage';

interface ConsoleCapture {
  errors: string[];
}

const captureConsole = (page: Page): ConsoleCapture => {
  const errors: string[] = [];

  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  page.on('pageerror', (err: Error) => {
    errors.push(`pageerror: ${err.message}`);
  });

  return { errors };
};

const REACT_REGRESSION_PATTERNS: RegExp[] = [
  /React does not recognize/i,
  /cmdk-input-wrapper/,
  /Maximum update depth exceeded/,
  /Too many re-renders/,
  /state update on an unmounted component/i,
];

const assertNoReactRegressions = (capture: ConsoleCapture, label: string) => {
  const reactErrors = capture.errors.filter(text =>
    REACT_REGRESSION_PATTERNS.some(pattern => pattern.test(text))
  );

  expect(
    reactErrors,
    `Unexpected React regressions on ${label}:\n${reactErrors.join('\n')}`
  ).toEqual([]);
};

const dashboardNavigationState = {
  fromEdit: true,
  editedProjectId: 'playwright-restored-project',
  navigationContext: {
    filters: {
      status: 'completed',
      company: 'all',
      artist: 'all',
      drillShape: 'all',
      yearFinished: 'all',
      includeMiniKits: true,
      includeDestashed: false,
      includeArchived: false,
      searchTerm: '__playwright_restore_probe__',
      searchAllFields: false,
      selectedTags: [],
    },
    sortField: 'kit_name',
    sortDirection: 'asc',
    currentPage: 1,
    pageSize: 24,
    preservationContext: {
      scrollPosition: 0,
      timestamp: Date.now(),
    },
    viewType: 'list',
  },
};

test.describe('React Doctor fix coverage', () => {
  test('dashboard restores route state and clears it after hydration', async ({ page }) => {
    const capture = captureConsole(page);

    await page.goto('/dashboard');
    await expect(libraryPageHeading(page)).toBeVisible();

    // The dashboard's filter URL-sync runs `setSearchParams(..., { replace: true })`
    // on mount, which commits a React Router `history.replaceState` carrying
    // `usr: null`. If we inject our probe state and then reload while that
    // app-driven write is still pending, it clobbers `usr` and the reload boots
    // without route state. Wait for the app to settle (its sync write has fired)
    // before injecting, so the raw `replaceState` below is the last writer.
    await page.waitForLoadState('networkidle');

    // Inject the probe via raw `history.replaceState`, which does not notify
    // React Router, so nothing in the app re-triggers the URL-sync write. With
    // the mount-time sync already flushed above, this is the last writer and the
    // state sits untouched until reload.
    await page.evaluate(state => {
      window.history.replaceState(
        {
          ...(window.history.state ?? {}),
          usr: state,
        },
        '',
        '/dashboard'
      );
    }, dashboardNavigationState);

    // Confirm the injection committed before reloading.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const current = window.history.state as { usr?: unknown } | null;
          return Boolean(current && current.usr != null);
        })
      )
      .toBe(true);

    await page.reload();

    await expect(libraryPageHeading(page)).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Search project titles' })).toHaveValue(
      '__playwright_restore_probe__'
    );
    await expect(page.getByText('Position Restored').first()).toBeVisible();

    await page.waitForFunction(() => {
      const state = window.history.state as { usr?: unknown } | null;
      return !state || state.usr == null;
    });

    assertNoReactRegressions(capture, 'dashboard route-state restore');
  });

  test('email confirmation reads the email from route state', async ({ page }) => {
    const capture = captureConsole(page);

    await page.goto('/email-confirmation');
    await page.evaluate(() => {
      window.history.replaceState(
        {
          ...(window.history.state ?? {}),
          usr: { email: 'playwright-confirmation@example.test' },
        },
        '',
        '/email-confirmation'
      );
    });

    await page.reload();

    await expect(page.getByRole('heading', { name: 'Check Your Email' })).toBeVisible();
    await expect(page.getByText('playwright-confirmation@example.test')).toBeVisible();
    assertNoReactRegressions(capture, 'email confirmation route state');
  });

  test('verify email clears the delayed login redirect on unmount', async ({ page }) => {
    const capture = captureConsole(page);

    await page.route('**/api/collections/users/confirm-verification', async route => {
      await route.fulfill({ status: 204 });
    });

    await page.goto('/auth/verify-email/playwright-token');
    await expect(page.getByRole('heading', { name: 'Email Verified!' })).toBeVisible();

    await page.goto('/overview');
    await expect(page.getByRole('heading', { name: /^Welcome back,/ })).toBeVisible();

    await page.waitForTimeout(3_200);
    await expect(page).toHaveURL(/\/overview(\?|$)/);
    assertNoReactRegressions(capture, 'verify email unmount cleanup');
  });

  test('command inputs open without leaking unknown React props', async ({ page }) => {
    const capture = captureConsole(page);

    await page.goto('/projects/new');
    await expect(page.getByRole('heading', { name: 'New project' })).toBeVisible();

    await page.getByRole('button', { name: /add tag/i }).click();
    const commandInput = page.getByPlaceholder('Search or create tags...');
    await expect(commandInput).toBeVisible();
    await commandInput.fill('playwright');

    expect(
      capture.errors.filter(error => /cmdk-input-wrapper|React does not recognize/i.test(error))
    ).toEqual([]);
    assertNoReactRegressions(capture, 'project tag command input');
  });

  test('not found route renders and links back home', async ({ page }) => {
    const capture = captureConsole(page);

    await page.goto('/definitely-not-a-real-route');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();

    await page.getByRole('link', { name: 'Back to Home' }).click();
    await expect(page).toHaveURL(/\/$/);
    assertNoReactRegressions(capture, 'not found route');
  });
});
