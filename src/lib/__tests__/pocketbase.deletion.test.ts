import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/services/accountDeletion/intentStore', () => ({ deletionIntents: { get: mocks.get } }));
vi.mock('@/utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
import { pb } from '../pocketbase';

function token() {
  return `test.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600, id: 'account-a' }))}.test`;
}
beforeEach(() => {
  vi.stubGlobal('indexedDB', {});
  localStorage.clear();
  mocks.get.mockReset();
  mocks.get.mockResolvedValue(undefined);
  pb.authStore.save(token(), { id: 'account-a', collectionName: 'users' });
});
afterEach(() => {
  pb.authStore.clear();
  vi.unstubAllGlobals();
});

describe('cross-tab deletion request fence', () => {
  it('reads the durable lock before sending an authenticated collection request', async () => {
    mocks.get.mockResolvedValue({ phase: 'pending' });
    await expect(
      pb.beforeSend!(`${pb.baseURL}/api/collections/projects/records`, { method: 'GET' })
    ).rejects.toMatchObject({ name: 'SessionChangedError' });
  });
  it('does not release a response that arrived after another tab persisted a pending intent', async () => {
    const request = await pb.beforeSend!(`${pb.baseURL}/api/collections/projects/records`, {
      method: 'GET',
    });
    mocks.get.mockResolvedValue({ phase: 'pending' });
    await expect(
      Promise.resolve().then(() =>
        pb.afterSend!(new Response('{}'), { items: [{ id: 'private' }] }, request.options)
      )
    ).rejects.toMatchObject({ name: 'SessionChangedError' });
  });
  it('fails closed when private storage is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    mocks.get.mockRejectedValue(new Error('Storage unavailable'));
    await expect(
      pb.beforeSend!(`${pb.baseURL}/api/collections/projects/records`, {
        method: 'POST',
        body: '{}',
      })
    ).rejects.toMatchObject({ name: 'SessionChangedError' });
  });
});
