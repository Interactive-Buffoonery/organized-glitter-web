const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export function sanitizeMarkdownUrl(url: string): string {
  const value = url.trim();

  if (!value) {
    return '';
  }

  try {
    const baseUrl =
      typeof window === 'undefined' ? 'https://organizedglitter.app' : window.location.origin;
    const parsed = new URL(value, baseUrl);

    if (!SAFE_PROTOCOLS.has(parsed.protocol)) {
      return '';
    }

    // Preserve relative URLs as-is so app-internal links don't get rewritten
    // to absolute form. For absolute URLs, return the WHATWG-normalized href
    // so the rendered value is always the parsed canonical form.
    const isAbsolute = /^[a-z][a-z0-9+.-]*:/i.test(value);
    return isAbsolute ? parsed.href : value;
  } catch {
    return '';
  }
}
