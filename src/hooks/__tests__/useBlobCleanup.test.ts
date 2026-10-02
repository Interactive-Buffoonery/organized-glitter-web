import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBlobCleanup } from '../useBlobCleanup';

describe('useBlobCleanup', () => {
  const mockCreateObjectURL = vi.fn();
  const mockRevokeObjectURL = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateObjectURL.mockReturnValue('blob:http://localhost/test-blob-123');
    globalThis.URL.createObjectURL = mockCreateObjectURL;
    globalThis.URL.revokeObjectURL = mockRevokeObjectURL;
  });

  it('should create and track blob URLs', () => {
    const { result } = renderHook(() => useBlobCleanup());
    const blob = new Blob(['test'], { type: 'text/plain' });

    let url: string;
    act(() => {
      url = result.current.createBlobUrl(blob);
    });

    expect(mockCreateObjectURL).toHaveBeenCalledWith(blob);
    expect(url!).toBe('blob:http://localhost/test-blob-123');
  });

  it('should revoke a tracked blob URL', () => {
    const { result } = renderHook(() => useBlobCleanup());
    const blob = new Blob(['test'], { type: 'text/plain' });

    let url: string;
    act(() => {
      url = result.current.createBlobUrl(blob);
    });

    act(() => {
      result.current.revokeBlobUrl(url!);
    });

    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/test-blob-123');
  });

  it('should not revoke URLs that were not created by this hook', () => {
    const { result } = renderHook(() => useBlobCleanup());

    act(() => {
      result.current.revokeBlobUrl('blob:http://localhost/unknown-url');
    });

    expect(mockRevokeObjectURL).not.toHaveBeenCalled();
  });

  it('should ignore non-blob URLs', () => {
    const { result } = renderHook(() => useBlobCleanup());

    act(() => {
      result.current.revokeBlobUrl('https://example.com/image.jpg');
    });

    expect(mockRevokeObjectURL).not.toHaveBeenCalled();
  });

  it('should revoke all tracked URLs', () => {
    let counter = 0;
    mockCreateObjectURL.mockImplementation(() => `blob:http://localhost/blob-${++counter}`);

    const { result } = renderHook(() => useBlobCleanup());
    const blob1 = new Blob(['a'], { type: 'text/plain' });
    const blob2 = new Blob(['b'], { type: 'text/plain' });

    act(() => {
      result.current.createBlobUrl(blob1);
      result.current.createBlobUrl(blob2);
    });

    act(() => {
      result.current.revokeAll();
    });

    expect(mockRevokeObjectURL).toHaveBeenCalledTimes(2);
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/blob-1');
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/blob-2');
  });

  it('should clean up all tracked URLs on unmount', () => {
    let counter = 0;
    mockCreateObjectURL.mockImplementation(() => `blob:http://localhost/blob-${++counter}`);

    const { result, unmount } = renderHook(() => useBlobCleanup());
    const blob = new Blob(['test'], { type: 'text/plain' });

    act(() => {
      result.current.createBlobUrl(blob);
      result.current.createBlobUrl(blob);
    });

    unmount();

    expect(mockRevokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it('should not double-revoke URLs already manually revoked', () => {
    const { result, unmount } = renderHook(() => useBlobCleanup());
    const blob = new Blob(['test'], { type: 'text/plain' });

    let url: string;
    act(() => {
      url = result.current.createBlobUrl(blob);
    });

    act(() => {
      result.current.revokeBlobUrl(url!);
    });

    expect(mockRevokeObjectURL).toHaveBeenCalledTimes(1);

    unmount();

    // Should not revoke again since it was already revoked
    expect(mockRevokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
