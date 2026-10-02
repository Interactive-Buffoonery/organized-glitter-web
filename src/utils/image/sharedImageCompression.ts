import { createImageCompressor } from './imageCompression';
import type { CompressionConfig } from './imageCompression';

export const SHARED_IMAGE_COMPRESSION_CONFIG: CompressionConfig = {
  maxSizeMB: 5.0,
  maxWidthOrHeight: 2048,
  initialQuality: 0.98,
  targetSize: 5 * 1024 * 1024,
  maxUploadSize: 50 * 1024 * 1024,
  warningSize: 25 * 1024 * 1024,
  label: 'sharedImageCompression',
  getAdaptiveOptions: file => {
    const fileSizeMB = file.size / (1024 * 1024);
    const outputFileType =
      file.type === 'image/png' ? ('image/png' as const) : ('image/jpeg' as const);

    if (fileSizeMB > 30) {
      return { maxSizeMB: 4.5, initialQuality: 0.96, fileType: outputFileType };
    } else if (fileSizeMB > 15) {
      return { maxSizeMB: 4.8, initialQuality: 0.97, fileType: outputFileType };
    } else if (fileSizeMB > 8) {
      return { maxSizeMB: 5.0, initialQuality: 0.98, fileType: outputFileType };
    }
    return {
      maxSizeMB: Math.min(5.0, fileSizeMB * 0.9),
      initialQuality: 0.99,
      fileType: outputFileType,
    };
  },
};

const compressor = createImageCompressor(SHARED_IMAGE_COMPRESSION_CONFIG);

export const compressUserImage = compressor.compress;
