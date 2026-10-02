export function publicUrl(path = '/'): string {
  const configured = import.meta.env.VITE_APP_URL?.trim();
  const origin =
    configured || (typeof window !== 'undefined' ? window.location.origin : 'https://app.invalid');
  const base = new URL(origin);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) {
    throw new Error('VITE_APP_URL must be an HTTP(S) origin without credentials');
  }
  return new URL(path, base.origin).href;
}
