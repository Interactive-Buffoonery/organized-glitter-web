import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { notify } from '@/lib/notifications';
import { compressProjectImage } from '@/utils/image/projectImageCompression';

import { useProjectImageCompression } from '../useProjectImageCompression';

vi.mock('@/lib/notifications', () => ({ notify: vi.fn() }));
vi.mock('@/utils/image/projectImageCompression', () => ({
  compressProjectImage: vi.fn(),
}));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
};

describe('useProjectImageCompression', () => {
  beforeEach(() => {
    vi.mocked(compressProjectImage).mockReset();
    vi.mocked(notify).mockReset();
  });

  it('keeps the latest compression busy when an older request finishes', async () => {
    const firstCompression = deferred<File>();
    const secondCompression = deferred<File>();
    let firstProgress!: (progress: number) => void;
    let secondProgress!: (progress: number) => void;
    vi.mocked(compressProjectImage)
      .mockImplementationOnce((_file, onProgress) => {
        firstProgress = onProgress;
        return firstCompression.promise;
      })
      .mockImplementationOnce((_file, onProgress) => {
        secondProgress = onProgress;
        return secondCompression.promise;
      });
    const { result } = renderHook(() => useProjectImageCompression());
    const largeBytes = new Uint8Array(5 * 1024 * 1024 + 1);
    const first = new File([largeBytes], 'first.jpg', { type: 'image/jpeg' });
    const second = new File([largeBytes], 'second.jpg', { type: 'image/jpeg' });
    const firstResult = new File(['first-result'], 'first-result.jpg', { type: 'image/jpeg' });
    const secondResult = new File(['second-result'], 'second-result.jpg', {
      type: 'image/jpeg',
    });

    let firstRequest!: Promise<File>;
    let secondRequest!: Promise<File>;
    act(() => {
      firstRequest = result.current.compressImage(first);
      secondRequest = result.current.compressImage(second);
    });

    act(() => {
      secondProgress(25);
      firstProgress(90);
    });
    expect(result.current.compressionProgress?.percentage).toBe(25);

    await act(async () => {
      firstCompression.resolve(firstResult);
      await firstRequest;
    });
    expect(result.current.isCompressing).toBe(true);

    await act(async () => {
      secondCompression.resolve(secondResult);
      await secondRequest;
    });
    expect(result.current.isCompressing).toBe(false);
  });

  it('does not report a failed compression superseded by a newer request', async () => {
    const firstCompression = deferred<File>();
    const secondCompression = deferred<File>();
    vi.mocked(compressProjectImage)
      .mockReturnValueOnce(firstCompression.promise)
      .mockReturnValueOnce(secondCompression.promise);
    const { result } = renderHook(() => useProjectImageCompression());
    const largeBytes = new Uint8Array(7 * 1024 * 1024);
    const first = new File([largeBytes], 'first.jpg', { type: 'image/jpeg' });
    const second = new File([largeBytes], 'second.jpg', { type: 'image/jpeg' });
    const secondResult = new File(['second-result'], 'second-result.jpg', {
      type: 'image/jpeg',
    });

    let firstRequest!: Promise<File>;
    let secondRequest!: Promise<File>;
    act(() => {
      firstRequest = result.current.compressImage(first);
      secondRequest = result.current.compressImage(second);
    });

    await act(async () => {
      firstCompression.reject(new Error('obsolete failure'));
      await expect(firstRequest).rejects.toThrow('Image compression failed');
    });

    expect(notify).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Compression Failed' })
    );
    expect(result.current.isCompressing).toBe(true);

    await act(async () => {
      secondCompression.resolve(secondResult);
      await secondRequest;
    });
  });
});
