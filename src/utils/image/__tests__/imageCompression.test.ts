import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createImageCompressor, type CompressionConfig } from '../imageCompression';

vi.mock('browser-image-compression', () => ({
  default: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn() },
}));

function createMockFile(name: string, sizeMB: number, type = 'image/jpeg'): File {
  const bytes = new ArrayBuffer(Math.round(sizeMB * 1024 * 1024));
  return new File([bytes], name, { type });
}

const baseConfig: CompressionConfig = {
  maxSizeMB: 5.0,
  maxWidthOrHeight: 2048,
  initialQuality: 0.98,
  targetSize: 5 * 1024 * 1024,
  maxUploadSize: 50 * 1024 * 1024,
  warningSize: 25 * 1024 * 1024,
  label: 'test',
  getAdaptiveOptions: () => ({
    maxSizeMB: 5.0,
    initialQuality: 0.98,
    fileType: 'image/jpeg' as const,
  }),
};

describe('createImageCompressor', () => {
  let compressor: ReturnType<typeof createImageCompressor>;

  beforeEach(() => {
    compressor = createImageCompressor(baseConfig);
  });

  describe('compress', () => {
    it('should return original file on compression failure if under target size', async () => {
      const { default: mockCompression } = await import('browser-image-compression');
      vi.mocked(mockCompression).mockRejectedValueOnce(new Error('Compression failed'));

      const file = createMockFile('small.jpg', 2);
      const result = await compressor.compress(file);
      expect(result).toBe(file);
    });

    it('should throw on compression failure if file exceeds target size', async () => {
      const { default: mockCompression } = await import('browser-image-compression');
      vi.mocked(mockCompression).mockRejectedValueOnce(new Error('Compression failed'));

      const file = createMockFile('big.jpg', 10);
      await expect(compressor.compress(file)).rejects.toThrow('Image compression failed');
    });
  });
});
