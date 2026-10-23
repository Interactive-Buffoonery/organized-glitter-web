import { act, renderHook } from '@testing-library/react';
import type { ChangeEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useImageUpload } from '../useImageUpload';

const { compressImageMock } = vi.hoisted(() => ({ compressImageMock: vi.fn() }));

vi.mock('@/hooks/useProjectImageCompression', () => ({
  useProjectImageCompression: () => ({
    compressImage: compressImageMock,
    isCompressing: false,
    compressionProgress: null,
  }),
}));
vi.mock('@/lib/notifications', () => ({ notify: vi.fn() }));

const changeEventFor = (file: File): ChangeEvent<HTMLInputElement> =>
  ({ target: { files: [file], value: '' } }) as unknown as ChangeEvent<HTMLInputElement>;

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => {
    resolve = next;
  });
  return { promise, resolve };
};

describe('useImageUpload', () => {
  beforeEach(() => {
    let previewNumber = 0;
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn(() => `blob:preview-${++previewNumber}`),
        revokeObjectURL: vi.fn(),
      })
    );
    compressImageMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('ignores compression results from a superseded file selection', async () => {
    const firstCompression = deferred<File>();
    const secondCompression = deferred<File>();
    compressImageMock
      .mockReturnValueOnce(firstCompression.promise)
      .mockReturnValueOnce(secondCompression.promise);
    const { result } = renderHook(() => useImageUpload('project-images'));
    const largeBytes = new Uint8Array(5 * 1024 * 1024 + 1);
    const first = new File([largeBytes], 'first.jpg', { type: 'image/jpeg' });
    const second = new File([largeBytes], 'second.jpg', { type: 'image/jpeg' });
    const firstResult = new File(['first-result'], 'first-result.jpg', { type: 'image/jpeg' });
    const secondResult = new File(['second-result'], 'second-result.jpg', { type: 'image/jpeg' });

    let firstRequest!: Promise<File | null>;
    let secondRequest!: Promise<File | null>;
    act(() => {
      firstRequest = result.current.handleImageChange(changeEventFor(first));
      secondRequest = result.current.handleImageChange(changeEventFor(second));
    });

    await act(async () => {
      secondCompression.resolve(secondResult);
      await secondRequest;
    });
    expect(result.current.processedFile).toBe(secondResult);

    await act(async () => {
      firstCompression.resolve(firstResult);
      await firstRequest;
    });

    expect(result.current.processedFile).toBe(secondResult);
  });
});
