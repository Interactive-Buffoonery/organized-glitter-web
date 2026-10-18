import { beforeEach, expect, it, vi } from 'vitest';
import { ArchiveColorKeysService, ArchiveRestoreSignInError } from '../archiveColorKeys.service';

const mocks = vi.hoisted(() => ({ send: vi.fn(), userId: vi.fn() }));
vi.mock('@/lib/pocketbase', () => ({ pb: { send: mocks.send } }));
vi.mock('@/services/auth', () => ({ getCurrentUserId: mocks.userId }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.userId.mockReturnValue('owner');
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
