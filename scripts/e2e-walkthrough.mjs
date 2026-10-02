// User-style frontend walkthrough against a hosted deployment.
// Logs in with E2E_TEST_EMAIL/PASSWORD, walks the main flows, screenshots each
// step, collects console errors, and cleans up the project it creates.
//
// Usage (from repo root):
//   set -a; . ./.env.e2e; set +a
//   E2E_APP_URL=https://organized-glitter-preview.up.railway.app \
//   SHOT_DIR=/tmp/og-walkthrough node scripts/e2e-walkthrough.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = (process.env.E2E_APP_URL || '').replace(/\/$/, '');
const OUT = process.env.SHOT_DIR || 'walkthrough-shots';
const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;
if (!BASE || !EMAIL || !PASSWORD) {
  console.error(
    'Set E2E_APP_URL, E2E_TEST_EMAIL, E2E_TEST_PASSWORD (source .env.e2e, NOT .env.e2e.local)'
  );
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

const consoleErrors = [];
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
page.on('console', m => {
  if (m.type() === 'error') consoleErrors.push(`[${page.url()}] ${m.text().slice(0, 300)}`);
});
page.on('pageerror', e =>
  consoleErrors.push(`[pageerror ${page.url()}] ${String(e).slice(0, 300)}`)
);

let step = 0;
async function shot(name) {
  step += 1;
  await page.waitForLoadState('networkidle').catch(() => {});
  // networkidle can fire before React paints data; give slow feeds a beat
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${String(step).padStart(2, '0')}-${name}.png` });
  console.log(`SHOT ${step} ${name} url=${page.url()}`);
}

// Login
await page.goto(`${BASE}/login`);
await shot('login-page');
await page.getByLabel(/email/i).fill(EMAIL);
await page.getByLabel(/password/i).fill(PASSWORD);
await page.getByRole('button', { name: /log ?in|sign ?in/i }).click();
await page.waitForURL(/\/overview/, { timeout: 20000 });
await shot('overview-after-login');

// Dashboard, both crafts
await page.goto(`${BASE}/dashboard`);
await shot('dashboard');
await page.goto(`${BASE}/dashboard?craft=coloring`);
await shot('dashboard-coloring');

// Project CRUD: create
await page.goto(`${BASE}/projects/new`);
await shot('project-new-form');
await page.getByLabel(/title/i).first().fill('E2E Walkthrough Test Project');
await page
  .getByRole('button', { name: /save|create|add project/i })
  .first()
  .click();
await page.waitForURL(/\/projects\/(?!new)[a-z0-9]+/i, { timeout: 20000 }).catch(() => {});
await shot('project-created-detail');
const projectUrl = page.url();

// Edit form
if (/\/projects\/[a-z0-9]+$/i.test(projectUrl)) {
  await page.goto(`${projectUrl}/edit`);
  await shot('project-edit');
}

// Randomizer, coloring, stats, notes
await page.goto(`${BASE}/randomizer`);
await shot('randomizer');
await page.goto(`${BASE}/coloring`);
await shot('coloring-dashboard');
const firstBook = page.locator('a[href*="/coloring/"]').first();
if (await firstBook.count()) {
  await firstBook.click();
  await shot('coloring-book-detail');
}
await page.goto(`${BASE}/stats`);
await shot('stats');
await page.goto(`${BASE}/notes`);
await shot('notes');

// Options + profile
await page.goto(`${BASE}/options`);
await shot('options-hub');
await page.goto(`${BASE}/options/tags`);
await shot('options-tags');
await page.goto(`${BASE}/profile`);
await shot('profile');
await page.goto(`${BASE}/profile?tab=data`);
await shot('profile-data-tab');

// Cleanup: delete the created project via the "..." actions menu
if (/\/projects\/[a-z0-9]+$/i.test(projectUrl)) {
  await page.goto(projectUrl);
  await page.waitForSelector('text=E2E Walkthrough Test Project', { timeout: 20000 });
  await page.getByRole('button', { name: 'More project actions' }).click();
  const del = page.getByRole('menuitem', { name: /delete project/i });
  if (await del.count()) {
    await del.click();
    const confirm = page.getByRole('button', { name: /^delete$/i }).last();
    if (await confirm.count()) await confirm.click();
    await page.waitForTimeout(2500);
    await shot('after-delete');
  } else {
    console.log('CLEANUP-NEEDED: delete option not found at', projectUrl);
  }
}

console.log('\nCONSOLE ERRORS:', consoleErrors.length);
for (const e of consoleErrors.slice(0, 30)) console.log(' -', e);
await browser.close();
