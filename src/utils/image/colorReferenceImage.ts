import {
  IMAGE_MAX_FILE_SIZE_BYTES,
  isSupportedImageMime,
  normalizeImageFile,
} from '@/utils/image/imagePolicy';

export async function prepareColorReferenceImage(input: File): Promise<File> {
  const file = normalizeImageFile(input);
  if (!isSupportedImageMime(file.type))
    throw new Error('Choose a JPG, PNG, WebP, GIF, or readable HEIC photo.');
  if (file.size > IMAGE_MAX_FILE_SIZE_BYTES) throw new Error('Choose a photo smaller than 50 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error('This photo could not be read. Export it as JPG or PNG and choose it again.');
    }
    if (!image.naturalWidth || !image.naturalHeight)
      throw new Error('This photo is empty. Choose another photo.');
    if (file.type !== 'image/heic' && file.type !== 'image/heif') return file;
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context)
      throw new Error('Could not convert this photo. Export it as JPG and choose it again.');
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', 0.98)
    );
    if (!blob || blob.size > IMAGE_MAX_FILE_SIZE_BYTES)
      throw new Error('Export this photo as JPG smaller than 50 MB and choose it again.');
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(url);
  }
}
