import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestDeletionOAuthProof, requestDeletionPasswordProof } from '../accountDeletion';
const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  oauth: vi.fn(),
  clear: vi.fn(),
  current: true,
  token: 'test-token',
}));
vi.mock('pocketbase', async () => {
  const actual = await vi.importActual<typeof import('pocketbase')>('pocketbase');
  return {
    ...actual,
    default: class {
      authStore = { clear: mocks.clear };
      send = mocks.send;
      collection() {
        return { authWithOAuth2: mocks.oauth };
      }
    },
  };
});
vi.mock('@/lib/pocketbase', () => ({
  pb: {
    baseURL: 'http://localhost:8090',
    authStore: {
      get token() {
        return mocks.token;
      },
      record: { id: 'account-a', verified: true },
    },
  },
}));
vi.mock('../sessionIdentity', () => ({
  captureSessionIdentity: () => ({ accountId: 'account-a', generation: 1, epoch: 'a' }),
  isCurrentSessionIdentity: () => mocks.current,
}));

describe('action-specific account deletion authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.current = true;
    mocks.token = 'test-token';
    mocks.send.mockResolvedValue(undefined);
    mocks.oauth.mockResolvedValue({ record: { id: 'account-a', verified: true } });
  });
  it('uses the account action and 32 random bytes without widening link/unlink types', async () => {
    const result = await requestDeletionPasswordProof('password', 'account-a');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.proof.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(mocks.send).toHaveBeenCalledWith(
      '/api/auth/step-up/password',
      expect.objectContaining({
        body: {
          action: 'delete_account',
          targetProvider: 'account',
          password: 'password',
          proof: result.proof.value,
        },
      })
    );
  });
  it('reverifies an unresolved request using its original proof', async () => {
    const result = await requestDeletionPasswordProof('password', 'account-a', 'x'.repeat(43));
    expect(result).toMatchObject({ success: true, proof: { value: 'x'.repeat(43) } });
    expect(mocks.send).toHaveBeenCalledWith(
      '/api/auth/step-up/password',
      expect.objectContaining({ body: expect.objectContaining({ proof: 'x'.repeat(43) }) })
    );
  });
  it('rejects a late password result after an account epoch change', async () => {
    mocks.send.mockImplementation(async () => {
      mocks.current = false;
    });
    await expect(requestDeletionPasswordProof('password', 'account-a')).resolves.toMatchObject({
      success: false,
    });
  });
  it('rejects a different OAuth account without replacing the current session', async () => {
    mocks.oauth.mockResolvedValue({ record: { id: 'account-b', verified: true } });
    await expect(requestDeletionOAuthProof('google', 'account-a')).resolves.toMatchObject({
      success: false,
    });
  });
  it.each(['password', 'oauth'])(
    'returns a safe %s error without raw auth payloads',
    async method => {
      mocks.send.mockRejectedValue(new Error('private upstream details'));
      mocks.oauth.mockRejectedValue(new Error('private upstream details'));
      const result =
        method === 'password'
          ? await requestDeletionPasswordProof('wrong', 'account-a')
          : await requestDeletionOAuthProof('google', 'account-a');
      expect(result.success).toBe(false);
      expect(JSON.stringify(result)).not.toContain('private upstream details');
    }
  );
});
