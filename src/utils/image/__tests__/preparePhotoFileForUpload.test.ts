import { beforeEach, describe, expect, it, vi } from 'vitest';
const { compress } = vi.hoisted(() => ({ compress: vi.fn() }));
vi.mock('../sharedImageCompression', () => ({ compressUserImage: compress }));
import { preparePhotoFileForUpload } from '../preparePhotoFileForUpload';

beforeEach(() => {
  compress.mockReset();
});
describe('photo upload preparation', () => {
  it('normalizes a missing MIME type before compression', async () => {
    const file = new File(['photo'], 'photo.jpg');
    const result = new File(['compressed'], 'photo.jpg', { type: 'image/jpeg' });
    compress.mockResolvedValue(result);
    await expect(preparePhotoFileForUpload(file)).resolves.toBe(result);
    expect(compress.mock.calls[0][0].type).toBe('image/jpeg');
    expect(compress.mock.calls[0][0].name).toBe('photo.jpg');
  });

  it('rejects files over the upload ceiling before compressing', async () => {
    const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
    Object.defineProperty(file, 'size', { value: 50 * 1024 * 1024 + 1 });
    await expect(preparePhotoFileForUpload(file)).rejects.toThrow('50MB upload limit');
    expect(compress).not.toHaveBeenCalled();
  });

  it('rejects unsupported files before compressing', async () => {
    await expect(
      preparePhotoFileForUpload(new File(['text'], 'notes.txt', { type: 'text/plain' }))
    ).rejects.toThrow('Unsupported image type');
    expect(compress).not.toHaveBeenCalled();
  });

  it('propagates compression failure instead of submitting the original file', async () => {
    compress.mockRejectedValue(new Error('Could not compress'));
    await expect(
      preparePhotoFileForUpload(new File(['photo'], 'photo.png', { type: 'image/png' }))
    ).rejects.toThrow('Could not compress');
  });
});
