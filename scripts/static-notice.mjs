import { readFileSync } from 'node:fs';
import path from 'node:path';

export function inlineStaticNotice(html, source) {
  return html.replace(
    '<!-- og-static-hosting-notice -->',
    () => `<script>\n${source.replace(/<\/script/gi, '<\\/script')}\n</script>`
  );
}

/** @returns {import('vite').Plugin} */
export function staticHostingNotice() {
  let publicDirectory;
  return {
    name: 'og-static-hosting-notice',
    apply: 'build',
    configResolved(config) {
      publicDirectory = config.publicDir;
    },
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        const landing = bundle['index.html'];
        if (landing?.type !== 'asset') return;
        landing.source = inlineStaticNotice(
          String(landing.source),
          readFileSync(path.join(publicDirectory, 'js/static-hosting-notice.js'), 'utf8')
        );
      },
    },
  };
}
