const configuredUpdates = import.meta.env.VITE_UPDATES_URL?.trim();

function resolveUpdatesUrl(): string | null {
  if (!configuredUpdates) return null;
  try {
    const url = new URL(configuredUpdates);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export const UPDATES_URL = resolveUpdatesUrl();
export const SUBSCRIBE_TO_UPDATES_URL = UPDATES_URL
  ? `${UPDATES_URL.split('#')[0]}#subscribe`
  : null;
