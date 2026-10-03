import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useProgressImageCompression } from '../useProgressImageCompression';

const { compressProgressImageMock, notifyMock } = vi.hoisted(() => ({
  compressProgressImageMock: vi.fn(),
  notifyMock: vi.fn(),
}));

vi.mock('@/utils/image/progressImageCompression', () => ({
  compressProgressImage: compressProgressImageMock,
}));
vi.mock('@/lib/notifications', () => ({ notify: notifyMock }));

describe('useProgressImageCompression announcements', () => {
  beforeEach(() => {
    compressProgressImageMock.mockReset();
    notifyMock.mockReset();
  });

  it('returns a compressed selection without a second success announcement', async () => {
    const original = new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'progress.jpg', {
      type: 'image/jpeg',
    });
    const compressed = new File(['compressed'], 'progress.jpg', { type: 'image/jpeg' });
    compressProgressImageMock.mockResolvedValue(compressed);
    const { result } = renderHook(() => useProgressImageCompression());

    let selected: File | undefined;
    await act(async () => {
      selected = await result.current.compressImage(original);
    });

    expect(selected).toBe(compressed);
    expect(notifyMock).not.toHaveBeenCalled();
  });
});
