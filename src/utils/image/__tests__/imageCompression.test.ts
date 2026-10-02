import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createImageCompressor,
  formatFileSize,
  getCompressionSummary,
  type CompressionConfig,
  type CompressionStats,
} from '../imageCompression';

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

  describe('validate', () => {
    it('should accept valid JPEG files', () => {
      const file = createMockFile('photo.jpg', 2, 'image/jpeg');
      const result = compressor.validate(file);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid PNG files', () => {
      const file = createMockFile('photo.png', 2, 'image/png');
      const result = compressor.validate(file);
      expect(result.isValid).toBe(true);
    });

    it('should accept valid WebP files', () => {
      const file = createMockFile('photo.webp', 2, 'image/webp');
      const result = compressor.validate(file);
      expect(result.isValid).toBe(true);
    });

    it('should accept valid HEIC files', () => {
      const file = createMockFile('photo.heic', 2, 'image/heic');
      const result = compressor.validate(file);
      expect(result.isValid).toBe(true);
    });

    it('should reject files exceeding max upload size', () => {
      const file = createMockFile('huge.jpg', 55);
      const result = compressor.validate(file);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('exceeds the 50MB limit');
    });

    it('should reject unsupported file types', () => {
      const file = createMockFile('document.pdf', 1, 'application/pdf');
      const result = compressor.validate(file);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Unsupported file type');
    });

    it('should warn for large files above warning threshold', () => {
      const file = createMockFile('large.jpg', 30);
      const result = compressor.validate(file);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]).toContain('Large file');
    });

    it('should warn for special characters in filename', () => {
      const file = createMockFile('photo#1.jpg', 2);
      const result = compressor.validate(file);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]).toContain('special characters');
    });

    it('should return no warnings for normal files', () => {
      const file = createMockFile('photo.jpg', 2);
      const result = compressor.validate(file);
      expect(result.warnings).toBeUndefined();
    });
  });

  describe('shouldCompress', () => {
    it('should return true for files larger than target size', () => {
      const file = createMockFile('large.jpg', 10);
      expect(compressor.shouldCompress(file)).toBe(true);
    });

    it('should return false for files smaller than target size', () => {
      const file = createMockFile('small.jpg', 2);
      expect(compressor.shouldCompress(file)).toBe(false);
    });
  });

  describe('compress', () => {
    it('should reject invalid files', async () => {
      const file = createMockFile('doc.pdf', 1, 'application/pdf');
      await expect(compressor.compress(file)).rejects.toThrow('Unsupported file type');
    });

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

describe('different configs produce different behavior', () => {
  it('should use config-specific target sizes for shouldCompress', () => {
    const smallTarget = createImageCompressor({ ...baseConfig, targetSize: 1 * 1024 * 1024 });
    const largeTarget = createImageCompressor({ ...baseConfig, targetSize: 20 * 1024 * 1024 });

    const file = createMockFile('photo.jpg', 5);
    expect(smallTarget.shouldCompress(file)).toBe(true);
    expect(largeTarget.shouldCompress(file)).toBe(false);
  });

  it('should use config-specific upload limits for validation', () => {
    const strictConfig = createImageCompressor({
      ...baseConfig,
      maxUploadSize: 10 * 1024 * 1024,
    });

    const file = createMockFile('photo.jpg', 15);
    expect(strictConfig.validate(file).isValid).toBe(false);
    expect(strictConfig.validate(file).error).toContain('10MB limit');
  });
});

describe('formatFileSize', () => {
  it('should format zero bytes', () => {
    expect(formatFileSize(0)).toBe('0 Bytes');
  });

  it('should format bytes', () => {
    expect(formatFileSize(500)).toBe('500 Bytes');
  });

  it('should format kilobytes', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('should format megabytes', () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB');
  });
});

describe('getCompressionSummary', () => {
  it('should show reduction for compressed files', () => {
    const stats: CompressionStats = {
      originalSizeMB: 10,
      compressedSizeMB: 3,
      compressionRatio: 70,
      originalDimensions: { width: 4000, height: 3000 },
      compressedDimensions: { width: 2048, height: 1536 },
    };
    expect(getCompressionSummary(stats)).toBe('Reduced from 10MB to 3MB (70% smaller)');
  });

  it('should show optimized message when no reduction', () => {
    const stats: CompressionStats = {
      originalSizeMB: 2,
      compressedSizeMB: 2,
      compressionRatio: 0,
      originalDimensions: { width: 1000, height: 800 },
      compressedDimensions: { width: 1000, height: 800 },
    };
    expect(getCompressionSummary(stats)).toBe('Size optimized: 2MB');
  });
});
