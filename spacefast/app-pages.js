// Test-only defaults. stage-spacefast.mjs replaces this module with built HTML.
export const APP_SHELL_HTML = '<!doctype html><html><body><div id="root"></div></body></html>';
export const NOT_FOUND_HTML =
  '<!doctype html><html><body><main data-error="page-not-found"><h1>Page not found</h1><a href="/">Back to Home</a></main></body></html>';
export const HTML_SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'",
  'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=()',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};
