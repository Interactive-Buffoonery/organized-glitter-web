import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCroppedImageFile } from '../imageUtils';

describe('createCroppedImageFile', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('rejects invalid crop inputs before touching the canvas', async () => {
    await expect(
      createCroppedImageFile(
        '',
        { x: 0, y: 0, width: 10, height: 10 },
        {
          fileName: 'crop.jpg',
          width: 100,
          height: 100,
        }
      )
    ).rejects.toThrow('Invalid image source');

    await expect(
      createCroppedImageFile(
        'blob:image',
        { x: 0, y: 0, width: 10, height: 10 },
        {
          fileName: 'crop.jpg',
          width: 0,
          height: 100,
        }
      )
    ).rejects.toThrow('Invalid output dimensions');
  });
});
