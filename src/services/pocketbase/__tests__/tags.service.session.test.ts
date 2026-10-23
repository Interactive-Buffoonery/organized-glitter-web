import { beforeEach, describe, expect, it, vi } from 'vitest';

const { store, methods } = vi.hoisted(() => {
  const listeners: Array<(token: string, record: { id: string } | null) => void> = [];
  return {
    store: {
      token: 'token-a',
      record: { id: 'account-a' } as { id: string } | null,
      onChange: (listener: (token: string, record: { id: string } | null) => void) =>
        listeners.push(listener),
      save(token: string, record: { id: string } | null) {
        this.token = token;
        this.record = record;
        listeners.forEach(listener => listener(token, this.record));
      },
    },
    methods: { getOne: vi.fn(), getList: vi.fn(), create: vi.fn() },
  };
});
vi.mock('@/lib/pocketbase', () => ({
  pb: {
    authStore: store,
    collection: () => methods,
    filter: (expression: string) => expression,
  },
}));
vi.mock('@/services/auth', () => ({
  isAuthenticated: () => Boolean(store.token),
  getCurrentUserId: () => store.record?.id ?? null,
}));

import { captureSessionIdentity, isCurrentSessionIdentity } from '@/services/auth/sessionIdentity';
import { TagService } from '../tags.service';

// Uses the actual service across its lookup suspension points: no transport or hook replacement.
describe('tag linking originating session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.save('token-a', { id: 'account-a' });
    methods.getOne.mockResolvedValue({ user: 'account-a' });
    methods.getList.mockResolvedValue({ items: [] });
    methods.create.mockResolvedValue({ id: 'relation-a' });
  });

  it('does not create a relation after logout and same-account login during the relation lookup', async () => {
    let release!: (value: { items: unknown[] }) => void;
    methods.getList.mockImplementation(
      () =>
        new Promise(resolve => {
          release = resolve;
        })
    );
    const identity = captureSessionIdentity();
    const pending = TagService.addTagToProject('project-a', 'tag-a', () =>
      isCurrentSessionIdentity(identity)
    );
    await vi.waitFor(() => expect(methods.getList).toHaveBeenCalled());
    store.save('', null);
    store.save('new-token-a', { id: 'account-a' });
    release({ items: [] });
    const result = await pending;
    expect(methods.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'error', error: { reason: 'session_changed' } });
  });

  it('does not start the relation lookup after a session change during ownership checks', async () => {
    let release!: (value: { user: string }) => void;
    const ownership = new Promise(resolve => {
      release = resolve;
    });
    methods.getOne.mockReturnValue(ownership);
    const identity = captureSessionIdentity();
    const pending = TagService.addTagToProject('project-a', 'tag-a', () =>
      isCurrentSessionIdentity(identity)
    );
    await vi.waitFor(() => expect(methods.getOne).toHaveBeenCalledTimes(2));
    store.save('', null);
    store.save('new-token-a', { id: 'account-a' });
    release({ user: 'account-a' });
    expect(await pending).toMatchObject({ status: 'error', error: { reason: 'session_changed' } });
    expect(methods.getList).not.toHaveBeenCalled();
    expect(methods.create).not.toHaveBeenCalled();
  });

  it('permits same-account token refresh during the relation lookup', async () => {
    methods.getList.mockImplementation(async () => {
      store.save('refreshed-token-a', { id: 'account-a' });
      return { items: [] };
    });
    const identity = captureSessionIdentity();
    const result = await TagService.addTagToProject('project-a', 'tag-a', () =>
      isCurrentSessionIdentity(identity)
    );
    expect(result.status).toBe('success');
    expect(methods.create).toHaveBeenCalledOnce();
  });
});
