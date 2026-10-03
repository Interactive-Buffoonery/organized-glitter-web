import { describe, expect, it } from 'vitest';
import {
  hasSupportedImageExtension,
  inferImageMimeFromExtension,
  isSupportedImageMime,
  normalizeImageFile,
  sanitizeImageFileName,
} from '../imagePolicy';

describe('imagePolicy', () => {
  it('recognizes supported image MIME types and extensions', () => {
    expect(isSupportedImageMime('image/jpeg')).toBe(true);
    expect(isSupportedImageMime('image/heic')).toBe(true);
    expect(isSupportedImageMime('image/jpg')).toBe(false);
    expect(isSupportedImageMime('application/octet-stream')).toBe(false);

    expect(inferImageMimeFromExtension('photo.JPG')).toBe('image/jpeg');
    expect(inferImageMimeFromExtension('page.heif')).toBe('image/heif');
    expect(inferImageMimeFromExtension('notes.txt')).toBeNull();
    expect(hasSupportedImageExtension('cover.webp')).toBe(true);
  });

  it('sanitizes file names and normalizes blank MIME types from extensions', () => {
    const file = new File(['image'], 'My Cover #1.HEIC', { type: '' });
    const normalized = normalizeImageFile(file);

    expect(sanitizeImageFileName(file.name)).toBe('My-Cover-_1.HEIC');
    expect(normalized.name).toBe('My-Cover-_1.HEIC');
    expect(normalized.type).toBe('image/heic');
  });

  it('returns the same File when no normalization is needed', () => {
    const file = new File(['image'], 'cover.jpg', { type: 'image/jpeg' });

    expect(normalizeImageFile(file)).toBe(file);
  });
});
