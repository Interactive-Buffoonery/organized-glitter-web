import { pb } from '@/lib/pocketbase';

export const requestPocketBaseHealth = (signal: AbortSignal): Promise<Response> =>
  fetch(`${pb.baseURL}/api/health`, {
    method: 'GET',
    cache: 'no-store',
    signal,
  });
