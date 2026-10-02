function resolvePocketBaseUrl(): string {
  const configured = import.meta.env.VITE_POCKETBASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  if (import.meta.env.DEV || import.meta.env.MODE === 'test') return 'http://localhost:8090';
  throw new Error(
    'VITE_POCKETBASE_URL is required. Set it to your PocketBase server URL before building or running in production mode.'
  );
}

export const POCKETBASE_URL = resolvePocketBaseUrl();
