import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();

function isDescendant(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function localFile(dist, url) {
  const pathname = url.split(/[?#]/, 1)[0].replace(/^\//, '');
  const distPath = path.resolve(dist);
  const assetPath = path.resolve(distPath, pathname);
  if (!pathname || !isDescendant(distPath, assetPath)) {
    throw new Error(`Invalid build asset path: ${url}`);
  }
  const actualPath = realpathSync(assetPath);
  if (!isDescendant(realpathSync(distPath), actualPath) || !statSync(actualPath).isFile()) {
    throw new Error(`Invalid build asset path: ${url}`);
  }
  return { path: pathname, bytes: readFileSync(actualPath) };
}

function sizes(file) {
  return {
    path: file.path,
    rawBytes: file.bytes.length,
    gzipBytes: gzipSync(file.bytes, { level: 9 }).length,
    brotliBytes: brotliCompressSync(file.bytes, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 5 },
    }).length,
  };
}

function sum(files, key) {
  return files.reduce((total, file) => total + file[key], 0);
}

function htmlAssets(html) {
  const urls = [];
  for (const tag of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const isScript = /^<script\b/i.test(tag[0]);
    if (!isScript && !/\brel=["']stylesheet["']/i.test(tag[0])) continue;
    const attribute = tag[0].match(
      isScript ? /\bsrc=["']([^"']+)["']/i : /\bhref=["']([^"']+)["']/i
    );
    if (attribute && attribute[1].startsWith('/')) urls.push(attribute[1]);
  }
  return urls;
}

function precacheUrls(sw) {
  const start = sw.indexOf('[{url:');
  const end = sw.indexOf('}])', start);
  if (start < 0 || end < 0) throw new Error('Generated service worker precache list is missing');
  const literal = sw.slice(start, end + 2);
  const json = literal.replaceAll('{url:', '{"url":').replaceAll(',revision:', ',"revision":');
  let entries;
  try {
    entries = JSON.parse(json);
  } catch {
    throw new Error('Generated service worker precache list has an unexpected format');
  }
  if (!entries.length || entries.some(entry => typeof entry.url !== 'string')) {
    throw new Error('Generated service worker precache list is empty or invalid');
  }
  return entries.map(entry => entry.url);
}

export function measureBuild(dist) {
  const html = readFileSync(path.join(dist, 'app.html'), 'utf8');
  const manifest = JSON.parse(readFileSync(path.join(dist, 'manifest.json'), 'utf8'));
  const byFile = new Map(Object.entries(manifest).map(([key, value]) => [value.file, key]));
  const eager = new Set();
  const visited = new Set();

  function includeManifestEntry(key) {
    if (visited.has(key)) return;
    const entry = manifest[key];
    if (!entry) throw new Error(`Missing Vite manifest import: ${key}`);
    visited.add(key);
    eager.add(entry.file);
    for (const css of entry.css ?? []) eager.add(css);
    for (const imported of entry.imports ?? []) includeManifestEntry(imported);
  }

  for (const url of htmlAssets(html)) {
    const file = localFile(dist, url);
    eager.add(file.path);
    const key = byFile.get(file.path);
    if (key) includeManifestEntry(key);
  }
  if (![...eager].some(file => file.endsWith('.js'))) {
    throw new Error('No eager JavaScript found in generated app.html');
  }
  const shellFiles = [...eager].sort().map(file => sizes(localFile(dist, file)));
  const sw = readFileSync(path.join(dist, 'sw.js'), 'utf8');
  const precacheEntries = precacheUrls(sw);
  const precacheFiles = [...new Set(precacheEntries)].map(file => sizes(localFile(dist, file)));

  return {
    shell: {
      files: shellFiles,
      rawBytes: sum(shellFiles, 'rawBytes'),
      gzipBytes: sum(shellFiles, 'gzipBytes'),
      brotliBytes: sum(shellFiles, 'brotliBytes'),
      jsGzipBytes: sum(
        shellFiles.filter(file => file.path.endsWith('.js')),
        'gzipBytes'
      ),
      cssGzipBytes: sum(
        shellFiles.filter(file => file.path.endsWith('.css')),
        'gzipBytes'
      ),
    },
    precache: {
      files: precacheFiles,
      manifestEntries: precacheEntries.length,
      rawBytes: sum(precacheFiles, 'rawBytes'),
    },
  };
}

export function checkBudgets(report, baseline) {
  const { shellGzipBytes, precacheRawBytes, allowedGrowthPercent } = baseline;
  if (
    !Number.isInteger(shellGzipBytes) ||
    shellGzipBytes <= 0 ||
    !Number.isInteger(precacheRawBytes) ||
    precacheRawBytes <= 0 ||
    !Number.isFinite(allowedGrowthPercent) ||
    allowedGrowthPercent < 0
  ) {
    throw new Error('Bundle budget baseline is invalid');
  }
  const failures = [];
  const limit = bytes => Math.ceil(bytes * (1 + allowedGrowthPercent / 100));
  if (report.shell.gzipBytes > limit(shellGzipBytes)) {
    failures.push(`Shell gzip ${report.shell.gzipBytes} B exceeds ${limit(shellGzipBytes)} B`);
  }
  if (report.precache.rawBytes > limit(precacheRawBytes)) {
    failures.push(
      `Precache raw ${report.precache.rawBytes} B exceeds ${limit(precacheRawBytes)} B`
    );
  }
  return failures;
}

function markdown(report, baseline, failures) {
  const kib = bytes => (bytes / 1024).toFixed(1);
  return [
    '## Bundle and PWA precache budget',
    '',
    '| Build measure | Current | Baseline |',
    '| --- | ---: | ---: |',
    `| Eager app shell, gzip | ${kib(report.shell.gzipBytes)} KiB | ${kib(baseline.shellGzipBytes)} KiB |`,
    `| Eager JavaScript, gzip | ${kib(report.shell.jsGzipBytes)} KiB | |`,
    `| Eager CSS, gzip | ${kib(report.shell.cssGzipBytes)} KiB | |`,
    `| Eager app shell, Brotli estimate | ${kib(report.shell.brotliBytes)} KiB | |`,
    `| Service worker precache, raw | ${kib(report.precache.rawBytes)} KiB (${report.precache.files.length} unique URLs, ${report.precache.manifestEntries} manifest entries) | ${kib(baseline.precacheRawBytes)} KiB |`,
    '',
    `Allowed growth from the committed baseline: ${baseline.allowedGrowthPercent}%. Local compression estimates are not CDN transfer measurements.`,
    failures.length ? `\nBudget failures: ${failures.join('; ')}` : '\nBoth budgets pass.',
    '',
  ].join('\n');
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const dist = path.join(root, 'dist');
  const report = measureBuild(dist);
  const baseline = JSON.parse(
    readFileSync(path.join(root, 'scripts/bundle-budget-baseline.json'), 'utf8')
  );
  const failures = checkBudgets(report, baseline);
  const text = markdown(report, baseline, failures);
  const output = path.join(root, '.tmp/bundle-budget');
  mkdirSync(output, { recursive: true });
  writeFileSync(
    path.join(output, 'report.json'),
    JSON.stringify({ report, baseline, failures }, null, 2)
  );
  writeFileSync(path.join(output, 'report.md'), text);
  if (process.env.GITHUB_STEP_SUMMARY)
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, text, { flag: 'a' });
  process.stdout.write(text);
  if (failures.length) process.exitCode = 1;
}
