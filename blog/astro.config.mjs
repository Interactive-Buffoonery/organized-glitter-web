import { defineConfig } from 'astro/config';
import { siteOrigin } from './src/lib/deployment.mjs';

export default defineConfig({
  site: siteOrigin,
  base: '/updates',
  trailingSlash: 'always',
  output: 'static',
  outDir: './dist/updates',
  build: {
    format: 'directory',
    inlineStylesheets: 'never',
  },
});
