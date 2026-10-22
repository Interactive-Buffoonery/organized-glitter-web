import { beforeEach, expect, it, vi } from 'vitest';
import { SessionChangedError } from '@/services/auth/sessionRecovery';
import { ArchiveColorKeysService, ArchiveRestoreSignInError } from '../archiveColorKeys.service';

const mocks = vi.hoisted(() => ({ send: vi.fn(), userId: vi.fn(), authStore: { isValid: true } }));
vi.mock('@/lib/pocketbase', () => ({ pb: { send: mocks.send, authStore: mocks.authStore } }));
vi.mock('@/services/auth', () => ({ getCurrentUserId: mocks.userId }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.userId.mockReturnValue('owner');
  mocks.authStore.isValid = true;
});
it('prompts for sign-in before sending a restore for a changed account', async () => {
  mocks.userId.mockReturnValue('another-user');
  await expect(
    ArchiveColorKeysService.restore('page', 'owner', 'coloring-page:page', [], 'archive')
  ).rejects.toBeInstanceOf(ArchiveRestoreSignInError);
  expect(mocks.send).not.toHaveBeenCalled();
});
it('preserves a committed restore when the account changes during the request', async () => {
  const result = { outcome: 'created', refMap: { 'coloring-color-key:key': 'saved' } };
  mocks.send.mockImplementation(async () => {
    mocks.userId.mockReturnValue('another-user');
    return result;
  });
  await expect(
    ArchiveColorKeysService.restore('page', 'owner', 'coloring-page:page', [], 'archive')
  ).resolves.toEqual(result);
});
it.each([
  ['a 401 response', () => Object.assign(new Error('Unauthorized'), { status: 401 })],
  [
    'an expired session',
    () => {
      mocks.authStore.isValid = false;
      return new Error('Your session expired. Sign in and try again.');
    },
  ],
  ['a session change', () => new SessionChangedError()],
])('prompts for sign-in when the request fails with %s', async (_, makeError) => {
  mocks.send.mockImplementation(async () => {
    throw makeError();
  });
  await expect(
    ArchiveColorKeysService.restore('page', 'owner', 'coloring-page:page', [], 'archive')
  ).rejects.toBeInstanceOf(ArchiveRestoreSignInError);
});
it('keeps other restore failures unchanged', async () => {
  const conflict = Object.assign(new Error('conflict'), { status: 409 });
  mocks.send.mockRejectedValue(conflict);
  await expect(
    ArchiveColorKeysService.restore('page', 'owner', 'coloring-page:page', [], 'archive')
  ).rejects.toBe(conflict);
});
