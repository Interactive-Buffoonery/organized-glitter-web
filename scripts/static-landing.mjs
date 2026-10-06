import path from 'node:path';
import { runnerImport } from 'vite';

const STYLESHEET = /<link rel="stylesheet" crossorigin href="\/assets\/[^"]+\.css">/g;

/**
 * Serve the prerendered landing as dist/index.html and move the SPA shell to
 * dist/app.html. The landing reuses the app's hashed stylesheet so both share
 * one cached file.
 */
export function promoteStaticLanding(bundle, emitFile) {
  const app = bundle['index.html'].source;
  const stylesheets = app.match(STYLESHEET);
  if (!stylesheets) throw new Error('Static landing needs the app stylesheet');
  const landing = bundle['landing.html'].source.replace(
    '<!-- og-app-stylesheet -->',
    stylesheets.join('\n    ')
  );
  delete bundle['index.html'];
  delete bundle['landing.html'];
  emitFile({ type: 'asset', fileName: 'app.html', source: app });
  emitFile({ type: 'asset', fileName: 'index.html', source: landing });
}

/** @returns {import('vite').Plugin} */
export function staticLanding() {
  let config;
  return {
    name: 'og-static-landing',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    transformIndexHtml: {
      order: 'pre',
      async handler(html, { filename }) {
        if (path.basename(filename) !== 'landing.html') return html;
        const { module } = await runnerImport('/src/components/marketing/StaticLanding.tsx', {
          configFile: false,
          root: config.root,
          mode: config.mode,
          resolve: { alias: { '@': path.join(config.root, 'src') } },
          esbuild: { jsx: 'automatic' },
          logLevel: 'error',
        });
        return html.replace('<!-- og-static-landing -->', module.renderStaticLanding());
      },
    },
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        promoteStaticLanding(bundle, file => this.emitFile(file));
      },
    },
  };
}
