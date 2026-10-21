import { isTokenExpired } from 'pocketbase';
import { pb } from '@/lib/pocketbase';

export function hasKnownExpiredDeletionSession(): boolean {
  const token = pb.authStore.token;
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return false;
  try {
    const payload: unknown = JSON.parse(atob(parts[1].replaceAll('-', '+').replaceAll('_', '/')));
    return (
      typeof payload === 'object' &&
      payload !== null &&
      'exp' in payload &&
      typeof payload.exp === 'number' &&
      Number.isFinite(payload.exp) &&
      isTokenExpired(token)
    );
  } catch {
    return false;
  }
}
