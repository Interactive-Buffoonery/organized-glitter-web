import { describe, expect, it } from 'vitest';
import { SHARED_IMAGE_COMPRESSION_CONFIG, compressUserImage } from '../sharedImageCompression';
import { compressProjectImage } from '../projectImageCompression';
import { compressProgressImage } from '../progressImageCompression';

describe('sharedImageCompression', () => {
  it('exposes the project-ladder configuration', () => {
    expect(SHARED_IMAGE_COMPRESSION_CONFIG.maxSizeMB).toBe(5.0);
    expect(SHARED_IMAGE_COMPRESSION_CONFIG.targetSize).toBe(5 * 1024 * 1024);
    expect(SHARED_IMAGE_COMPRESSION_CONFIG.maxUploadSize).toBe(50 * 1024 * 1024);
    expect(SHARED_IMAGE_COMPRESSION_CONFIG.warningSize).toBe(25 * 1024 * 1024);
    expect(SHARED_IMAGE_COMPRESSION_CONFIG.initialQuality).toBe(0.98);
  });

  it('returns the same adaptive ladder for both small and large files', () => {
    const small = new File([new Uint8Array(1024)], 'small.jpg', { type: 'image/jpeg' });
    const large = Object.defineProperty(
      new File([new Uint8Array(1024)], 'large.jpg', { type: 'image/jpeg' }),
      'size',
      { value: 32 * 1024 * 1024 }
    );

    const smallOptions = SHARED_IMAGE_COMPRESSION_CONFIG.getAdaptiveOptions(small);
    const largeOptions = SHARED_IMAGE_COMPRESSION_CONFIG.getAdaptiveOptions(large);

    expect(smallOptions.initialQuality).toBe(0.99);
    expect(largeOptions.initialQuality).toBe(0.96);
    expect(largeOptions.maxSizeMB).toBe(4.5);
  });

  it('exports the same compressor reference for project and progress flows', () => {
    expect(compressProjectImage).toBe(compressUserImage);
    expect(compressProgressImage).toBe(compressUserImage);
  });
});
