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

  it.each([10 * 1024 * 1024, 5 * 1024 * 1024])(
    'accepts a large source compressed to %i bytes',
    async size => {
      const source = new File(['source'], 'photo.jpg', { type: 'image/jpeg' });
      Object.defineProperty(source, 'size', { value: 50 * 1024 * 1024 });
      const output = new File(['compressed'], 'photo.jpg', { type: 'image/jpeg' });
      Object.defineProperty(output, 'size', { value: size });
      compress.mockResolvedValue(output);

      await expect(preparePhotoFileForUpload(source)).resolves.toBe(output);
      expect(compress).toHaveBeenCalledWith(source);
    }
  );

  it('rejects compressed output one byte over the destination limit', async () => {
    const output = new File(['compressed'], 'photo.jpg', { type: 'image/jpeg' });
    Object.defineProperty(output, 'size', { value: 10 * 1024 * 1024 + 1 });
    compress.mockResolvedValue(output);

    await expect(
      preparePhotoFileForUpload(new File(['source'], 'photo.jpg', { type: 'image/jpeg' }))
    ).rejects.toThrow('Image exceeds the 10MB upload limit after compression');
  });

  it('propagates compression failure instead of submitting the original file', async () => {
    const error = new Error('Could not compress');
    compress.mockRejectedValue(error);
    await expect(
      preparePhotoFileForUpload(new File(['photo'], 'photo.png', { type: 'image/png' }))
    ).rejects.toBe(error);
  });
});
