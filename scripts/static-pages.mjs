import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { runnerImport } from 'vite';

const STYLESHEET = /<link rel="stylesheet" crossorigin href="\/assets\/[^"]+\.css">/g;
const STYLESHEET_MARKER = '<!-- og-app-stylesheet -->';
const PAGE_MARKER = '<!-- og-static-page -->';

/**
 * Serve the prerendered landing as dist/index.html and move the SPA shell to
 * dist/app.html. Static pages reuse the app's hashed stylesheet so they share
 * one cached file. The critical layer comes first and has the lowest cascade
 * priority, so it only shapes a page when that stylesheet fails to load.
 */
export function promoteStaticPages(bundle, emitFile, criticalCss) {
  const app = bundle['index.html'].source;
  const stylesheets = app.match(STYLESHEET);
  if (!stylesheets) throw new Error('Static pages need the app stylesheet');
  const styles = [`<style>\n${criticalCss}\n</style>`, ...stylesheets].join('\n    ');
  for (const asset of Object.values(bundle)) {
    if (asset.type === 'asset' && String(asset.source).includes(STYLESHEET_MARKER)) {
      asset.source = String(asset.source).replace(STYLESHEET_MARKER, styles);
    }
  }
  const landing = bundle['landing.html'].source;
  delete bundle['index.html'];
  delete bundle['landing.html'];
  emitFile({ type: 'asset', fileName: 'app.html', source: app });
  emitFile({ type: 'asset', fileName: 'index.html', source: landing });
}

/** Static pages only render at build time; pnpm dev serves the SPA for them. */
function serveSpaInDev() {
  return {
    name: 'og-static-pages-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const pathname = req.url?.split('?')[0].replace(/\/$/, '') ?? '';
        const file = path.join(server.config.root, `${pathname}.html`);
        if (
          /^\/[a-z-]+$/.test(pathname) &&
          existsSync(file) &&
          readFileSync(file, 'utf8').includes(PAGE_MARKER)
        ) {
          req.url = '/index.html';
        }
        next();
      });
    },
  };
}

/** @returns {import('vite').Plugin[]} */
export function staticPages() {
  let config;
  const build = {
    name: 'og-static-pages',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    transformIndexHtml: {
      order: 'pre',
      async handler(html, { filename }) {
        if (!html.includes(PAGE_MARKER)) return html;
        const { module } = await runnerImport('/src/components/marketing/StaticPages.tsx', {
          configFile: false,
          root: config.root,
          mode: config.mode,
          resolve: { alias: { '@': path.join(config.root, 'src') } },
          esbuild: { jsx: 'automatic' },
          logLevel: 'error',
        });
        return html.replace(PAGE_MARKER, module.renderStaticPage(path.basename(filename, '.html')));
      },
    },
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        const criticalCss = readFileSync(
          path.join(config.root, 'src/styles/static-critical.css'),
          'utf8'
        ).trim();
        promoteStaticPages(bundle, file => this.emitFile(file), criticalCss);
      },
    },
  };
  return [build, serveSpaInDev()];
}
