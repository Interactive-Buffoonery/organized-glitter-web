import { configuredOrigin } from '../../../server/deployment-config.js';

export const siteOrigin = configuredOrigin(process.env.VITE_APP_URL) || 'http://localhost:3000';

export function optionalServiceUrl(value) {
  if (!value) return null;
  configuredOrigin(value);
  return new URL(value).href;
}
