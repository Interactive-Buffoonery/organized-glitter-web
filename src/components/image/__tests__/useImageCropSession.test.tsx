import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useImageCropSession } from '../useImageCropSession';

describe('useImageCropSession', () => {
  it('drops a pending crop when the preset reset key changes', async () => {
    let finish!: (file: File) => void;
    const process = vi.fn(
      () =>
        new Promise<File>(resolve => {
          finish = resolve;
        })
    );
    const onComplete = vi.fn();
    const { result, rerender } = renderHook(
      ({ resetKey }) => useImageCropSession({ file: null, externalUrl: 'blob:source', resetKey }),
      { initialProps: { resetKey: 'square' } }
    );

    act(() => {
      void result.current.processImage(process, onComplete, 'Crop Error', 'Failed');
    });
    expect(result.current.isProcessing).toBe(true);

    rerender({ resetKey: 'portrait' });
    expect(result.current.isProcessing).toBe(false);

    await act(async () => {
      finish(new File(['old'], 'old.jpg', { type: 'image/jpeg' }));
    });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('keeps a newer crop busy when an older source finishes', async () => {
    const finish: Array<(file: File) => void> = [];
    const process = vi.fn(
      () =>
        new Promise<File>(resolve => {
          finish.push(resolve);
        })
    );
    const onComplete = vi.fn();
    const { result, rerender } = renderHook(
      ({ source }) => useImageCropSession({ file: null, externalUrl: source }),
      { initialProps: { source: 'blob:first' } }
    );

    act(() => {
      void result.current.processImage(process, onComplete, 'Crop Error', 'Failed');
    });
    expect(result.current.isProcessing).toBe(true);

    rerender({ source: 'blob:second' });
    act(() => {
      void result.current.processImage(process, onComplete, 'Crop Error', 'Failed');
    });
    expect(result.current.isProcessing).toBe(true);

    await act(async () => {
      finish[0](new File(['old'], 'old.jpg', { type: 'image/jpeg' }));
    });
    expect(result.current.isProcessing).toBe(true);
    expect(onComplete).not.toHaveBeenCalled();

    const currentFile = new File(['new'], 'new.jpg', { type: 'image/jpeg' });
    await act(async () => {
      finish[1](currentFile);
    });
    await waitFor(() => expect(result.current.isProcessing).toBe(false));
    expect(onComplete).toHaveBeenCalledExactlyOnceWith(currentFile);
  });
});
