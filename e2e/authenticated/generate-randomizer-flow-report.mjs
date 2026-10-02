import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const flowDir = path.join(rootDir, 'playwright-artifacts', 'randomizer-flow');
const reportPath = path.join(flowDir, 'index.html');

const stepLabels = new Map([
  ['01-initial-no-selection', 'Initial: No Selection'],
  ['02-no-selection-disabled', 'No Selection Disabled'],
  ['03-all-selected-ready', 'All Selected Ready'],
  ['04-spin-result', 'Spin Result'],
  ['05-section-size-picker', 'Section Size Picker'],
  ['05-section-size-unavailable', 'Section Size Unavailable'],
  ['06-section-size-result', 'Section Size Result'],
  ['07-coloring-books-mode', 'Coloring Books Mode'],
  ['08-coloring-books-ready', 'Coloring Books Ready'],
  ['09-coloring-book-result', 'Coloring Book Result'],
  ['10-coloring-book-page-picker', 'Coloring Book Page Picker'],
]);

const escapeHtml = value =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const collectScreenshots = async dir => {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const screenshots = await Promise.all(
    entries.map(async entry => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return collectScreenshots(entryPath);
      if (!entry.name.endsWith('.png')) return [];

      const relativePath = path.relative(flowDir, entryPath);
      const parts = relativePath.split(path.sep);
      return [
        {
          project: parts[0] ?? 'unknown-project',
          theme: parts[1] ?? 'unknown-theme',
          step: path.basename(entry.name, '.png'),
          path: relativePath,
        },
      ];
    })
  );

  return screenshots.flat();
};

const screenshots = await collectScreenshots(flowDir);

if (screenshots.length === 0) {
  throw new Error(`No randomizer flow screenshots found in ${flowDir}`);
}

const groups = new Map();
for (const screenshot of screenshots) {
  const key = `${screenshot.project}:${screenshot.theme}`;
  const group = groups.get(key) ?? {
    project: screenshot.project,
    theme: screenshot.theme,
    screenshots: [],
  };
  group.screenshots.push(screenshot);
  groups.set(key, group);
}

const generatedAt = new Date().toLocaleString('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const sections = Array.from(groups.values())
  .sort((a, b) => `${a.project}:${a.theme}`.localeCompare(`${b.project}:${b.theme}`))
  .map(group => {
    const cards = group.screenshots
      .sort((a, b) => a.step.localeCompare(b.step))
      .map(screenshot => {
        const label = stepLabels.get(screenshot.step) ?? screenshot.step;
        return `
          <article class="step-card">
            <header>
              <p class="eyebrow">${escapeHtml(screenshot.step)}</p>
              <h3>${escapeHtml(label)}</h3>
            </header>
            <a href="${escapeHtml(screenshot.path)}">
              <img src="${escapeHtml(screenshot.path)}" alt="${escapeHtml(
                `${group.theme} randomizer ${label}`
              )}" loading="lazy">
            </a>
          </article>`;
      })
      .join('');

    return `
      <section class="theme-section">
        <div class="theme-heading">
          <p class="eyebrow">${escapeHtml(group.project)}</p>
          <h2>${escapeHtml(group.theme)} Mode</h2>
        </div>
        <div class="step-grid">${cards}</div>
      </section>`;
  })
  .join('');

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Randomizer Flow Review</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f7f1e8;
        --panel: #fffaf2;
        --text: #2c241d;
        --muted: #7b6f63;
        --line: #e1d3c3;
        --accent: #8a4f7d;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main { width: min(1800px, calc(100vw - 48px)); margin: 0 auto; padding: 40px 0 64px; }
      .hero { display: flex; justify-content: space-between; gap: 24px; align-items: end; margin-bottom: 32px; }
      h1 { font-size: clamp(2rem, 4vw, 4.5rem); line-height: 0.95; letter-spacing: -0.06em; margin: 0; }
      h2 { font-size: clamp(1.5rem, 2vw, 2.6rem); letter-spacing: -0.04em; margin: 0; }
      h3 { font-size: 1.05rem; margin: 0; }
      .meta, .eyebrow, a { color: var(--muted); }
      .eyebrow { margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.14em; font-size: 0.72rem; font-weight: 700; }
      .theme-section { border-top: 1px solid var(--line); padding: 28px 0 40px; }
      .theme-heading { margin-bottom: 18px; }
      .step-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 18px; align-items: start; }
      .step-card { background: var(--panel); border: 1px solid var(--line); border-radius: 18px; overflow: hidden; }
      .step-card header { padding: 14px 16px; border-bottom: 1px solid var(--line); }
      img { display: block; width: 100%; height: auto; background: white; }
      @media (max-width: 760px) {
        main { width: min(100vw - 24px, 680px); padding-top: 24px; }
        .hero { display: block; }
        .step-grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main>
      <header class="hero">
        <div>
          <p class="eyebrow">Local artifact</p>
          <h1>Randomizer Flow</h1>
        </div>
        <p class="meta">${screenshots.length} captures. Generated ${escapeHtml(generatedAt)}.</p>
      </header>
      ${sections}
    </main>
  </body>
</html>`;

await fs.mkdir(flowDir, { recursive: true });
await fs.writeFile(reportPath, html);
console.log(`Randomizer flow report: ${reportPath}`);
