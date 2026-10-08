import { proxyPosthog } from './posthog.js';
import { isKnownAppRoute, isStaticFileRequest } from '../server/app-route-policy.js';
import {
  APP_SHELL_HTML,
  HTML_SECURITY_HEADERS,
  LANDING_HTML,
  NOT_FOUND_HTML,
} from './app-pages.js';

const htmlHeaders = {
  'Content-Type': 'text/html; charset=utf-8',
  ...HTML_SECURITY_HEADERS,
};
export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/glimmer/')) {
      return proxyPosthog(request, env);
    }

    if (url.pathname.startsWith('/api/')) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    if (isKnownAppRoute(url.pathname)) {
      const html = url.pathname === '/' ? LANDING_HTML : APP_SHELL_HTML;
      return new Response(request.method === 'HEAD' ? null : html, {
        headers: { ...htmlHeaders, 'Cache-Control': 'public, max-age=0, must-revalidate' },
      });
    }

    if (isStaticFileRequest(url.pathname)) {
      return new Response(request.method === 'HEAD' ? null : 'Not found', {
        status: 404,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          ...HTML_SECURITY_HEADERS,
          'Cache-Control': 'no-store',
        },
      });
    }

    return new Response(request.method === 'HEAD' ? null : NOT_FOUND_HTML, {
      status: 404,
      headers: { ...htmlHeaders, 'Cache-Control': 'no-store' },
    });
  },
};
