import { defineConfig, loadEnv, type Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { searchForWorkspaceRoot } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { APP_ROUTE_PATHS, PUBLIC_PAGE_PATHS } from './server/app-route-policy.js';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { injectAppIconLinks } from './scripts/app-icon-links.mjs';
import { ensureStartupScriptsBeforeAppModules } from './scripts/ensure-startup-script-order.mjs';

/**
 * Inject the public PostHog key/host into public HTML entries so the
 * pre-React bootstrap shell can beacon bootstrap_failure_shown without the
 * React AnalyticsProvider. Uses the same public Vite env vars as the SDK.
 */
function injectPublicAnalyticsConfig(
  isProduction: boolean,
  env: Record<string, string>,
  buildId: string
): Plugin {
  return {
    name: 'og-inject-public-analytics-config',
    transformIndexHtml(html) {
      const key = env.VITE_PUBLIC_POSTHOG_KEY?.trim() || '';
      const host = isProduction
        ? '/glimmer'
        : env.VITE_PUBLIC_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com';
      const snippet = `<script>window.__OG_PUBLIC_ANALYTICS__=${JSON.stringify({
        key,
        host,
        release: buildId,
      })};</script>`;
      if (!html.includes('<!-- og-public-analytics -->')) {
        return html;
      }
      return html.replace('<!-- og-public-analytics -->', snippet);
    },
  };
}

/**
 * Vite injects bundled type=module scripts into <head>. Keep /js/loading.js
 * ahead of those tags so app-loaded listeners exist before React can mark ready.
 */
function preserveStartupScriptOrder(): Plugin {
  return {
    name: 'og-preserve-startup-script-order',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return ensureStartupScriptsBeforeAppModules(html);
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';
  const projectRoot = fileURLToPath(new URL('.', import.meta.url));
  const worktreeParent = path.dirname(projectRoot);
  const dependencyRoot =
    path.basename(worktreeParent) === '.worktrees' ? path.dirname(worktreeParent) : projectRoot;
  const env = loadEnv(mode, projectRoot, '');

  const resolvedBuildIdFromEnv =
    process.env.GITHUB_SHA || process.env.RAILWAY_GIT_COMMIT_SHA || process.env.VITE_APP_VERSION;

  const buildId = (() => {
    if (isProduction) {
      if (!resolvedBuildIdFromEnv) {
        throw new Error(
          'Missing build identifier for production build. Please set one of: GITHUB_SHA, RAILWAY_GIT_COMMIT_SHA, or VITE_APP_VERSION.'
        );
      }
      return resolvedBuildIdFromEnv;
    }

    return 'dev-build';
  })();

  return {
    base: '/', // Ensure all assets load from root path
    define: {
      __APP_BUILD_ID__: JSON.stringify(buildId),
      __APP_TEST_ENV__: JSON.stringify(process.env.APP_TEST_ENV || ''),
    },
    plugins: [
      { name: 'og-app-icon-links', transformIndexHtml: injectAppIconLinks },
      injectPublicAnalyticsConfig(isProduction, env, buildId),
      tailwindcss(),
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        devOptions: {
          enabled: true,
        },
        workbox: {
          // The post-build sourcemap step deletes all .map files (so none ship),
          // which would leave sw.js pointing at a now-404 sw.js.map. Disable the
          // service-worker sourcemap so no dangling reference is emitted.
          sourcemap: false,
          // Activate the new SW immediately on update so a fresh page load
          // serves new responses (with new headers like CSP) instead of
          // waiting for every tab to close. Workbox precaches the full
          // Response — headers and all — so a stale SW will replay an old
          // CSP header even if the edge has a corrected one.
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          navigateFallbackAllowlist: APP_ROUTE_PATHS.map(
            route => new RegExp(`^${route.replace(/:[^/]+/g, '[^/?]+')}/?(?:\\?.*)?$`, 'i')
          ),
          // Public routes need their own initial HTML, including with an active service worker.
          navigateFallbackDenylist: PUBLIC_PAGE_PATHS.map(
            route => new RegExp(`^${route}/?(?:\\?.*)?$`, 'i')
          ).concat(/^\/updates(?:\/|\?|$)/i),
          inlineWorkboxRuntime: true,
          // Silence noisy "No route found" by explicitly passing PocketBase API
          // calls through to the network. registerRoute defaults to GET, so the
          // collections endpoint needs one route per mutation method or the
          // noise returns; files and health checks are read-only (GET).
          runtimeCaching: (['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD'] as const)
            .map(method => ({
              urlPattern: /^https:\/\/data\.organizedglitter\.app\/api\/collections\//i,
              handler: 'NetworkOnly' as const,
              method,
            }))
            .concat({
              urlPattern: /^https:\/\/data\.organizedglitter\.app\/api\/files\//i,
              handler: 'NetworkOnly' as const,
              method: 'GET' as const,
            })
            .concat({
              urlPattern: /^https:\/\/data\.organizedglitter\.app\/api\/health$/i,
              handler: 'NetworkOnly' as const,
              method: 'GET' as const,
            }),
        },
        includeAssets: ['site-icon.ico', 'site-touch-icon.png'],
        manifest: {
          name: 'Organized Glitter',
          short_name: 'Organized Glitter',
          description:
            'A coloring book and diamond art tracker for stash status, progress photos, and completed projects',
          id: '/',
          // The manifest cannot follow the system or account appearance. Berry
          // Cream is the intentional branded install/splash fallback, even if
          // Dark replaces it after launch. Runtime chrome follows the selected
          // theme through theme-color.js.
          theme_color: '#f8e8f6',
          background_color: '#f8e8f6',
          display: 'standalone',
          scope: '/',
          start_url: '/login',
          icons: [
            {
              src: 'android-chrome-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'android-chrome-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              // Adaptive icon so Android renders a proper masked shape instead of
              // a letterboxed square.
              src: 'android-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: 'site-touch-icon.png',
              sizes: '180x180',
              type: 'image/png',
            },
          ],
        },
      }),
      preserveStartupScriptOrder(),
    ],

    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      preserveSymlinks: false,
    },

    build: {
      // 'hidden' emits .map files (so PostHog can symbolicate minified stacks)
      // but omits the //# sourceMappingURL comment, so the maps are never
      // publicly linked from the shipped JS. They are uploaded to PostHog and
      // deleted post-build by scripts/upload-sourcemaps.mjs.
      sourcemap: isProduction ? 'hidden' : false,
      manifest: 'manifest.json', // Enable manifest generation as manifest.json
      target: 'es2020',
      minify: 'terser',
      chunkSizeWarningLimit: 1000,
      terserOptions: {
        compress: {
          drop_console: mode === 'production',
          drop_debugger: true,
        },
        mangle: {
          safari10: true,
        },
        format: {
          comments: false,
        },
      },
      rollupOptions: {
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
          about: fileURLToPath(new URL('./about.html', import.meta.url)),
          links: fileURLToPath(new URL('./links.html', import.meta.url)),
          privacy: fileURLToPath(new URL('./privacy.html', import.meta.url)),
          terms: fileURLToPath(new URL('./terms.html', import.meta.url)),
        },
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;

            // Match exact package directory boundaries to avoid false matches
            // like `react-markdown` getting bucketed with `react`.
            const inPkg = (name: string) =>
              id.includes(`/node_modules/${name}/`) || id.includes(`\\node_modules\\${name}\\`);
            const inScope = (scope: string) =>
              id.includes(`/node_modules/${scope}/`) || id.includes(`\\node_modules\\${scope}\\`);

            // React + Radix + TanStack Query share a tight dependency graph
            // (Radix uses React internals, Query uses React, several packages
            // re-export React utilities). Keeping them in separate chunks
            // creates circular vendor chunks that Rollup warns about and that
            // can cause runtime init-order issues. Bundling them together is
            // simpler, cacheable across deploys, and still cleanly separated
            // from app code.
            if (
              inPkg('react') ||
              inPkg('react-dom') ||
              inPkg('react-is') ||
              inPkg('scheduler') ||
              inPkg('react-router') ||
              inPkg('react-router-dom') ||
              inPkg('@remix-run/router') ||
              inScope('@radix-ui') ||
              inScope('@tanstack')
            ) {
              return 'react-vendor';
            }
            if (inPkg('pocketbase')) {
              return 'pocketbase-vendor';
            }
            if (inPkg('posthog-js') || inScope('@posthog')) {
              return 'analytics-vendor';
            }
            if (inPkg('react-hook-form') || inScope('@hookform') || inPkg('zod')) {
              return 'form-vendor';
            }
            if (
              inPkg('lucide-react') ||
              inPkg('cmdk') ||
              inPkg('sonner') ||
              inPkg('vaul') ||
              inPkg('next-themes') ||
              inPkg('class-variance-authority') ||
              inPkg('clsx') ||
              inPkg('tailwind-merge') ||
              inPkg('tw-animate-css')
            ) {
              return 'ui-vendor';
            }

            return undefined;
          },
        },
      },
    },

    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
      exclude: ['pocketbase'],
    },

    server: {
      port: 3000,
      host: true,
      strictPort: false, // Allow fallback to next available port
      fs: {
        allow: Array.from(new Set([searchForWorkspaceRoot(projectRoot), dependencyRoot])),
      },
      hmr: {
        port: undefined, // Use same port as dev server
      },
      cors: true,
    },

    preview: {
      port: 3001,
      host: true,
    },
  };
});
