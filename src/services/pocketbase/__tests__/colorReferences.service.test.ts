import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ColorReferencesService } from '../colorReferences.service';

const mocks = vi.hoisted(() => ({ send: vi.fn(), token: vi.fn(), getURL: vi.fn() }));
vi.mock('@/lib/pocketbase', () => ({
  pb: { send: mocks.send, files: { getToken: mocks.token, getURL: mocks.getURL } },
}));
vi.mock('@/services/auth', () => ({ getCurrentUserId: () => 'owner' }));

beforeEach(() => vi.clearAllMocks());

describe('color reference restore results', () => {
  it('does not invent a count when an older hook omits restore bookkeeping', async () => {
    mocks.send.mockResolvedValue({ reference: { id: 'restored' } });
    await expect(
      ColorReferencesService.restore('page', 'owner', {
        action: 'restore',
        notes: '',
        files: [],
        restoreKey: 'archive',
      })
    ).rejects.toThrow('confirm the restored photos');
  });
});
