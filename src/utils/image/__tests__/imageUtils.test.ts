import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCroppedImageFile,
  inferMimeFromExtension,
  isPocketBaseImageMime,
} from '../imageUtils';

describe('inferMimeFromExtension', () => {
  it('maps common extensions to PocketBase-compatible MIME types', () => {
    expect(inferMimeFromExtension('photo.jpg')).toBe('image/jpeg');
    expect(inferMimeFromExtension('photo.JPG')).toBe('image/jpeg');
    expect(inferMimeFromExtension('photo.jpeg')).toBe('image/jpeg');
    expect(inferMimeFromExtension('pic.png')).toBe('image/png');
    expect(inferMimeFromExtension('pic.webp')).toBe('image/webp');
    expect(inferMimeFromExtension('pic.gif')).toBe('image/gif');
    expect(inferMimeFromExtension('iphone.heic')).toBe('image/heic');
    expect(inferMimeFromExtension('iphone.HEIF')).toBe('image/heif');
  });

  it('returns null for files without a recognised image extension', () => {
    expect(inferMimeFromExtension('document.pdf')).toBeNull();
    expect(inferMimeFromExtension('noextension')).toBeNull();
    expect(inferMimeFromExtension('weird.tar.gz')).toBeNull();
  });

  it('handles UUID-prefixed filenames that come from processing pipelines', () => {
    const name = '7611cfee_15a6_4253_a222_a07482ca3534_5ja3c33x65.jpg';
    expect(inferMimeFromExtension(name)).toBe('image/jpeg');
  });
});

describe('isPocketBaseImageMime', () => {
  it('accepts PocketBase allowlisted MIME types', () => {
    expect(isPocketBaseImageMime('image/jpeg')).toBe(true);
    expect(isPocketBaseImageMime('image/png')).toBe(true);
    expect(isPocketBaseImageMime('image/gif')).toBe(true);
    expect(isPocketBaseImageMime('image/webp')).toBe(true);
    expect(isPocketBaseImageMime('image/heic')).toBe(true);
    expect(isPocketBaseImageMime('image/heif')).toBe(true);
  });

  it('rejects empty / unknown / non-image types', () => {
    expect(isPocketBaseImageMime('')).toBe(false);
    expect(isPocketBaseImageMime(undefined)).toBe(false);
    expect(isPocketBaseImageMime(null)).toBe(false);
    expect(isPocketBaseImageMime('application/octet-stream')).toBe(false);
    // image/jpg is a common browser typo; PocketBase only accepts image/jpeg.
    expect(isPocketBaseImageMime('image/jpg')).toBe(false);
    expect(isPocketBaseImageMime('image/bmp')).toBe(false);
  });
});

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

  it('draws the requested crop and returns a typed File', async () => {
    const drawImage = vi.fn();
    const toBlob = vi.fn((callback: BlobCallback, type?: string) =>
      callback(new Blob(['cropped'], { type }))
    );
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toBlob,
    } as unknown as HTMLCanvasElement;

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(tagName => {
      if (tagName === 'canvas') {
        return canvas;
      }

      return originalCreateElement(tagName);
    });

    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = '';

      set src(_value: string) {
        this.onload?.();
      }
    }

    vi.stubGlobal('Image', MockImage);

    const file = await createCroppedImageFile(
      'blob:image',
      { x: 10, y: 20, width: 300, height: 225 },
      {
        fileName: 'project-cropped.jpg',
        width: 1200,
        height: 900,
        type: 'image/jpeg',
        quality: 0.85,
      }
    );

    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(900);
    expect(drawImage).toHaveBeenCalledWith(
      expect.any(MockImage),
      10,
      20,
      300,
      225,
      0,
      0,
      1200,
      900
    );
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.85);
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('project-cropped.jpg');
    expect(file.type).toBe('image/jpeg');
  });
});
