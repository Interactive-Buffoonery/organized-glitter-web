import path from 'node:path';
import { readFileSync } from 'node:fs';

const attribute = (tag, name) => tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))?.[1];

const assetFile = url => {
  if (
    typeof url !== 'string' ||
    !/^\/assets\/[a-zA-Z0-9_./-]+\.(?:js|css)$/.test(url) ||
    url.split('/').some(part => part === '..' || part === '.')
  ) {
    throw new Error(`Invalid bootstrap asset URL: ${url}`);
  }
  return url.slice(1);
};

const inlineScript = (file, source) =>
  `<script data-og-shell="${file}">\n(function () {\n${source.replace(/<\/script/gi, '<\\/script')}\n})();\n</script>`;

export function rewriteBootstrapHtml(html, bundle, readPublicFile) {
  if (html.includes('id="app-bootstrap-resources"')) return html;
  const scripts = [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)];
  const modules = scripts.filter(match => attribute(match[0], 'type') === 'module');
  if (!modules.length) return html;

  const graphFor = file => {
    const resources = new Set();
    const visit = dependency => {
      assetFile(`/${dependency}`);
      if (resources.has(`/${dependency}`)) return;
      const chunk = bundle[dependency];
      if (chunk?.type !== 'chunk') throw new Error(`Missing bootstrap chunk: ${dependency}`);
      resources.add(`/${dependency}`);
      for (const css of chunk.viteMetadata?.importedCss ?? []) {
        assetFile(`/${css}`);
        if (bundle[css]?.type !== 'asset') throw new Error(`Missing bootstrap CSS: ${css}`);
        resources.add(`/${css}`);
      }
      for (const imported of chunk.imports) visit(imported);
    };
    visit(file);
    return [...resources];
  };

  const files = [...new Set(modules.map(match => assetFile(attribute(match[0], 'src'))))];
  const graphs = Object.fromEntries(
    Object.values(bundle)
      .filter(file => file.type === 'chunk' && file.fileName.endsWith('.js'))
      .map(file => [`/${file.fileName}`, graphFor(file.fileName)])
  );
  for (const file of files) {
    if (!graphs[`/${file}`]) throw new Error(`Missing bootstrap chunk: ${file}`);
  }
  const entries = files.filter(file =>
    files.every(other => graphs[`/${file}`].includes(`/${other}`))
  );
  if (entries.length !== 1) throw new Error('Bootstrap requires exactly one app entry graph');
  const entry = `/${entries[0]}`;
  const resources = new Set(graphs[entry]);
  let result = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, tag => {
    if (attribute(tag, 'type') === 'module') return '';
    const source = attribute(tag, 'src')?.split('?')[0];
    if (['/js/loading.js', '/js/bootstrap-analytics.js', '/theme-color.js'].includes(source)) {
      return '';
    }
    return tag;
  });
  result = result.replace(/<link\b[^>]*>/gi, tag => {
    const rel = attribute(tag, 'rel');
    const href = attribute(tag, 'href');
    if (rel === 'modulepreload') return '';
    if (rel !== 'stylesheet') return tag;
    if (href?.startsWith('/assets/')) {
      const file = assetFile(href);
      if (bundle[file]?.type !== 'asset') throw new Error(`Missing bootstrap CSS: ${file}`);
      resources.add(href);
      return '';
    }
    const file = href?.split('?')[0].slice(1);
    if (['css/loading.css', 'css/error.css', 'css/safe-area.css'].includes(file)) {
      const css = readPublicFile(file).replace(/<\/style/gi, '<\\/style');
      return `<style data-og-shell="${file}">\n${css}\n</style>`;
    }
    return tag;
  });
  if (resources.size > 256 || Object.keys(graphs).length > 256) {
    throw new Error('Bootstrap graph exceeds the loader resource budget');
  }
  const configuration = JSON.stringify({ entry, resources: [...resources], graphs }).replaceAll(
    '<',
    '\\u003c'
  );
  const shell = ['theme-color.js', 'js/bootstrap-analytics.js', 'js/loading.js'].filter(file =>
    scripts.some(match => attribute(match[0], 'src')?.split('?')[0] === `/${file}`)
  );
  const startup = [
    ...shell.map(file => inlineScript(file, readPublicFile(file))),
    `<script type="application/json" id="app-bootstrap-resources">${configuration}</script>`,
    inlineScript('js/bootstrap-resources.js', readPublicFile('js/bootstrap-resources.js')),
  ].join('\n');
  if (!result.includes('</body>')) throw new Error('Bootstrap app shell is missing its body');
  return result.replace('</body>', `${startup}\n</body>`);
}

/** @returns {import('vite').Plugin} */
export function bootstrapResources() {
  let publicDirectory;
  return {
    name: 'og-bootstrap-resources',
    apply: 'build',
    configResolved(config) {
      publicDirectory = config.publicDir;
    },
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        for (const file of Object.values(bundle)) {
          if (file.type !== 'asset' || !file.fileName.endsWith('.html')) continue;
          file.source = rewriteBootstrapHtml(String(file.source), bundle, name =>
            readFileSync(path.join(publicDirectory, name), 'utf8')
          );
        }
      },
    },
  };
}
