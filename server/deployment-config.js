export function configuredOrigin(value) {
  if (!value?.trim()) return null;
  if (/[\s;'"<>]/.test(value.trim())) throw new Error('Invalid deployment origin');
  const url = new URL(value.trim());
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hostname.includes('*')
  ) {
    throw new Error('Deployment origins must use HTTP(S) without credentials');
  }
  return url.origin;
}

export function buildContentSecurityPolicy(env = {}) {
  const backend = configuredOrigin(env.VITE_POCKETBASE_URL);
  const analytics =
    env.VITE_PUBLIC_POSTHOG_KEY && env.VITE_PUBLIC_POSTHOG_HOST !== '/glimmer'
      ? configuredOrigin(env.VITE_PUBLIC_POSTHOG_HOST)
      : null;
  const assets = env.VITE_PUBLIC_POSTHOG_KEY
    ? configuredOrigin(env.POSTHOG_PROXY_ASSET_HOST)
    : null;
  const wordpress = configuredOrigin(env.WORDPRESS_API_URL);
  const contact = configuredOrigin(env.WORDPRESS_CONTACT_URL);
  const newsletter = configuredOrigin(env.MAILPOET_IFRAME_URL);
  const paypal = env.VITE_PAYPAL_BUTTON_ID ? 'https://www.paypalobjects.com' : null;
  const images = (env.PUBLIC_IMAGE_ORIGINS || '').split(',').map(value => configuredOrigin(value));
  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", 'https://accounts.google.com', assets, paypal],
    'connect-src': [
      "'self'",
      backend,
      analytics,
      'https://accounts.google.com',
      env.VITE_PAYPAL_BUTTON_ID ? 'https://www.paypal.com' : null,
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': [
      "'self'",
      backend,
      wordpress,
      paypal,
      ...images,
      'https://i.ytimg.com',
      'data:',
      'blob:',
    ],
    'font-src': ["'self'", 'data:'],
    'worker-src': ["'self'", 'blob:'],
    'frame-src': [
      "'self'",
      'https://accounts.google.com',
      newsletter,
      contact,
      env.VITE_PAYPAL_BUTTON_ID ? 'https://www.paypal.com' : null,
    ],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  return (
    Object.entries(directives)
      .map(([name, values]) => `${name} ${[...new Set(values.filter(Boolean))].join(' ')}`)
      .join('; ') + ';'
  );
}

export function analyticsProxyTarget(url, env = {}) {
  const ingest = configuredOrigin(env.POSTHOG_PROXY_HOST);
  if (!ingest) return null;
  const asset = configuredOrigin(env.POSTHOG_PROXY_ASSET_HOST) || ingest;
  const isStatic = url.pathname.startsWith('/glimmer/static/');
  const isArray = url.pathname.startsWith('/glimmer/array/');
  const pathname = url.pathname.replace('/glimmer/', '/');
  if (pathname.startsWith('//') || !url.pathname.startsWith('/glimmer/')) return null;
  const target = new URL(isStatic || isArray ? asset : ingest);
  target.pathname = pathname;
  target.search = url.search;
  return target;
}

export function escapeOriginForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
