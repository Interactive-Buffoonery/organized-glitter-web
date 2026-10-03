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

  it('revokes replaced previews and the active preview on unmount', async () => {
    const { result, unmount } = renderHook(() => useImageUpload('project-images'));
    const first = new File(['first'], 'first.jpg', { type: 'image/jpeg' });
    const second = new File(['second'], 'second.jpg', { type: 'image/jpeg' });

    await act(async () => {
      await result.current.handleImageChange(changeEventFor(first));
      await result.current.handleImageChange(changeEventFor(second));
    });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-2');
  });

  it('replaces pending input resets and clears the timer on unmount', async () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useImageUpload('project-images'));
    const first = new File(['first'], 'first.jpg', { type: 'image/jpeg' });
    const second = new File(['second'], 'second.jpg', { type: 'image/jpeg' });

    await act(async () => {
      await result.current.handleImageChange(changeEventFor(first));
      await result.current.handleImageChange(changeEventFor(second));
    });

    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
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

  it('revokes the resize object URL when canvas conversion fails', async () => {
    class MockImage {
      width = 100;
      height = 100;
      onload: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.(new Event('load')));
      }
    }

    vi.stubGlobal('Image', MockImage);
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tagName: string, options?: ElementCreationOptions) => {
        if (tagName === 'canvas') {
          return {
            getContext: () => ({ drawImage: vi.fn() }),
            toBlob: (callback: BlobCallback) => callback(null),
            width: 0,
            height: 0,
          } as unknown as HTMLCanvasElement;
        }

        return originalCreateElement(tagName, options);
      });
    const { result } = renderHook(() => useImageUpload('avatars', 'avatar'));
    const avatar = new File(['avatar'], 'avatar.jpg', { type: 'image/jpeg' });

    await act(async () => {
      await result.current.handleImageChange(changeEventFor(avatar));
    });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-2');
    createElementSpy.mockRestore();
  });
});
