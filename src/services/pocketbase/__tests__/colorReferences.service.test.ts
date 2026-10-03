import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ColorReferencesService, type ColorReference } from '../colorReferences.service';

const mocks = vi.hoisted(() => ({ send: vi.fn(), token: vi.fn(), getURL: vi.fn() }));
vi.mock('@/lib/pocketbase', () => ({
  pb: { send: mocks.send, files: { getToken: mocks.token, getURL: mocks.getURL } },
}));
vi.mock('@/services/auth', () => ({ getCurrentUserId: () => 'owner' }));

beforeEach(() => vi.clearAllMocks());

describe('color reference restore results', () => {
  it.each([0, 1])(
    'preserves the server photo count %i and restored identity',
    async addedPhotoCount => {
      mocks.send.mockResolvedValue({ reference: { id: 'restored' }, addedPhotoCount });
      await expect(
        ColorReferencesService.restore('page', 'owner', {
          action: 'restore',
          notes: '',
          files: [new File(['sheet'], 'sheet.png')],
          restoreKey: 'archive',
        })
      ).resolves.toEqual({ referenceId: 'restored', addedPhotoCount });
    }
  );
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
  it('does not request file tokens for notes-only references', async () => {
    await expect(
      ColorReferencesService.urls({ photos: [] } as unknown as ColorReference, 'owner')
    ).resolves.toEqual([]);
    expect(mocks.token).not.toHaveBeenCalled();
  });
  it('keeps swatch URLs stable so the image component can add the current token', async () => {
    mocks.getURL.mockImplementation(
      (_, filename: string, options?: { thumb?: string }) =>
        `https://pb.example/api/files/swatches/ref-1/${filename}${options?.thumb ? `?thumb=${options.thumb}` : ''}`
    );
    const reference = { photos: ['sheet.jpg'] } as unknown as ColorReference;

    await expect(ColorReferencesService.urls(reference, 'owner')).resolves.toEqual([
      {
        filename: 'sheet.jpg',
        thumbnail: 'https://pb.example/api/files/swatches/ref-1/sheet.jpg?thumb=320x320f',
        original: 'https://pb.example/api/files/swatches/ref-1/sheet.jpg',
      },
    ]);
    expect(mocks.token).not.toHaveBeenCalled();
  });
});
