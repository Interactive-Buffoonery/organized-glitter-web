import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const reviewDir = path.join(rootDir, 'playwright-artifacts', 'screen-review');
const resultsDir = path.join(reviewDir, 'results');
const reportPath = path.join(reviewDir, 'index.html');

const escapeHtml = value =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const readJsonFiles = async dir => {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(
    entries.map(async entry => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return readJsonFiles(entryPath);
      if (!entry.name.endsWith('.json')) return [];
      const raw = await fs.readFile(entryPath, 'utf8');
      return [JSON.parse(raw)];
    })
  );

  return files.flat();
};

const results = await readJsonFiles(resultsDir);

if (results.length === 0) {
  throw new Error(`No screen review results found in ${resultsDir}`);
}

const screens = new Map();
for (const result of results) {
  const current = screens.get(result.id) ?? { ...result, variants: [] };
  current.variants.push(result);
  screens.set(result.id, current);
}

const generatedAt = new Date().toLocaleString('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const screenSections = Array.from(screens.values())
  .sort((a, b) => a.title.localeCompare(b.title))
  .map(screen => {
    const variants = screen.variants
      .sort((a, b) => a.projectName.localeCompare(b.projectName))
      .map(
        variant => `
          <article class="variant-card">
            <header>
              <strong>${escapeHtml(variant.projectName)}</strong>
              <a href="${escapeHtml(variant.path)}">${escapeHtml(variant.path)}</a>
            </header>
            <a href="${escapeHtml(variant.screenshot)}">
              <img src="${escapeHtml(variant.screenshot)}" alt="${escapeHtml(
                `${screen.title} in ${variant.projectName}`
              )}" loading="lazy">
            </a>
          </article>`
      )
      .join('');

    return `
      <section class="screen-section">
        <div class="screen-heading">
          <div>
            <p class="eyebrow">${escapeHtml(screen.review)}</p>
            <h2>${escapeHtml(screen.title)}</h2>
          </div>
          ${screen.notes ? `<p class="notes">${escapeHtml(screen.notes)}</p>` : ''}
        </div>
        <div class="variant-grid">${variants}</div>
      </section>`;
  })
  .join('');

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Organized Glitter Screen Review</title>
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
      h2 { font-size: clamp(1.4rem, 2vw, 2.4rem); letter-spacing: -0.04em; margin: 0; }
      .meta, .notes, .eyebrow, a { color: var(--muted); }
      .eyebrow { margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.14em; font-size: 0.72rem; font-weight: 700; }
      .screen-section { border-top: 1px solid var(--line); padding: 28px 0 36px; }
      .screen-heading { display: flex; justify-content: space-between; gap: 24px; align-items: start; margin-bottom: 18px; }
      .notes { max-width: 48rem; margin: 0; }
      .variant-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 18px; align-items: start; }
      .variant-card { background: var(--panel); border: 1px solid var(--line); border-radius: 18px; overflow: hidden; }
      .variant-card header { display: flex; justify-content: space-between; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--line); }
      .variant-card a { overflow-wrap: anywhere; text-decoration-color: color-mix(in srgb, var(--accent), transparent 55%); }
      img { display: block; width: 100%; height: auto; background: white; }
      @media (max-width: 760px) {
        main { width: min(100vw - 24px, 680px); padding-top: 24px; }
        .hero, .screen-heading { display: block; }
        .variant-grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main>
      <header class="hero">
        <div>
          <p class="eyebrow">Local artifact</p>
          <h1>Screen Review</h1>
        </div>
        <p class="meta">${results.length} captures across ${screens.size} screens. Generated ${escapeHtml(generatedAt)}.</p>
      </header>
      ${screenSections}
    </main>
  </body>
</html>`;

await fs.mkdir(reviewDir, { recursive: true });
await fs.writeFile(reportPath, html);
console.log(`Screen review report: ${reportPath}`);
