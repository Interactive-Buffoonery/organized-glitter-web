import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import imageCompression from 'browser-image-compression';
import { useProgressImageCompression } from '../useProgressImageCompression';
import { useProjectImageCompression } from '../useProjectImageCompression';
import { preparePhotoFileForUpload } from '@/utils/image/preparePhotoFileForUpload';

vi.mock('browser-image-compression', () => ({ default: vi.fn() }));
vi.mock('@/lib/notifications', () => ({ notify: vi.fn() }));

const MiB = 1024 * 1024;
const photo = (size: number) => {
  const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

beforeEach(() => {
  vi.mocked(imageCompression).mockReset().mockResolvedValue(photo(1));
});

describe('interactive compression policies', () => {
  it.each([
    ['progress', useProgressImageCompression, 3],
    ['project', useProjectImageCompression, 5],
  ] as const)('%s skips at its threshold and compresses above it', async (_, useHook, limit) => {
    const { result } = renderHook(useHook);
    const original = photo(limit * MiB);
    await act(async () => {
      expect(await result.current.compressImage(original)).toBe(original);
    });
    expect(imageCompression).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.compressImage(photo(limit * MiB + 1));
    });
    expect(imageCompression).toHaveBeenCalledOnce();
    expect(imageCompression).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({
        maxWidthOrHeight: 2048,
        maxSizeMB: expect.any(Number),
        fileType: 'image/jpeg',
        preserveExif: false,
      })
    );
  });

  it('keeps the project fallback at 6MiB and rejects above it', async () => {
    vi.mocked(imageCompression).mockRejectedValue(new Error('decode failed'));
    const { result } = renderHook(useProjectImageCompression);
    const original = photo(6 * MiB);
    await act(async () => {
      expect(await result.current.compressImage(original)).toBe(original);
      await expect(result.current.compressImage(photo(6 * MiB + 1))).rejects.toThrow(
        'file is too large'
      );
    });
  });

  it('preserves progress fallback while imports propagate failures above 5MiB', async () => {
    vi.mocked(imageCompression).mockRejectedValue(new Error('decode failed'));
    const original = photo(7 * MiB);
    const { result } = renderHook(useProgressImageCompression);
    await act(async () => {
      expect(await result.current.compressImage(original)).toBe(original);
    });
    await expect(preparePhotoFileForUpload(original)).rejects.toThrow('decode failed');
  });

  it('retains the shared compressor fallback for imports at 5MiB', async () => {
    vi.mocked(imageCompression).mockRejectedValue(new Error('decode failed'));
    const original = photo(5 * MiB);
    await expect(preparePhotoFileForUpload(original)).resolves.toBe(original);
  });
});
