export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export type SupportedImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

export const IMAGE_ACCEPT_ATTRIBUTE = 'image/*';

export const IMAGE_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export const CROP_OUTPUT_TYPE = 'image/jpeg';

const IMAGE_EXTENSION_TO_MIME: Record<string, SupportedImageMimeType> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

type ImageFrameMode = 'crop' | 'contain';

export interface CropPreset {
  id: string;
  label: string;
  description?: string;
  aspect: number;
  outputWidth: number;
  outputHeight: number;
  mode?: ImageFrameMode;
}

export const PROJECT_IMAGE_CROP_PRESETS: CropPreset[] = [
  {
    id: 'fit-4-3',
    label: 'Whole image',
    description: 'No cropping',
    aspect: 4 / 3,
    outputWidth: 1200,
    outputHeight: 900,
    mode: 'contain',
  },
  {
    id: 'rectangle-4-3',
    label: 'Wide',
    description: 'Fills the cover',
    aspect: 4 / 3,
    outputWidth: 1200,
    outputHeight: 900,
  },
  {
    id: 'portrait-3-4',
    label: 'Tall',
    description: 'For phone photos',
    aspect: 3 / 4,
    outputWidth: 900,
    outputHeight: 1200,
  },
  {
    id: 'square-1-1',
    label: 'Square',
    description: 'For square kits',
    aspect: 1,
    outputWidth: 1200,
    outputHeight: 1200,
  },
];

export const PROGRESS_NOTE_CROP_PRESETS: CropPreset[] = [
  {
    id: 'fit-4-3',
    label: 'Whole image',
    description: 'No cropping',
    aspect: 4 / 3,
    outputWidth: 1200,
    outputHeight: 900,
    mode: 'contain',
  },
  {
    id: 'rectangle-4-3',
    label: 'Wide',
    description: 'For landscape photos',
    aspect: 4 / 3,
    outputWidth: 1200,
    outputHeight: 900,
  },
  {
    id: 'portrait-3-4',
    label: 'Tall',
    description: 'For phone photos',
    aspect: 3 / 4,
    outputWidth: 900,
    outputHeight: 1200,
  },
  {
    id: 'square-1-1',
    label: 'Square',
    description: 'For close-ups',
    aspect: 1,
    outputWidth: 1200,
    outputHeight: 1200,
  },
];

export const COLORING_COVER_CROP_PRESETS: CropPreset[] = [
  {
    id: 'cover-3-4',
    label: 'Tall',
    description: 'Fits most books',
    aspect: 3 / 4,
    outputWidth: 900,
    outputHeight: 1200,
  },
  {
    id: 'square-1-1',
    label: 'Square',
    description: 'For square books',
    aspect: 1,
    outputWidth: 1200,
    outputHeight: 1200,
  },
  {
    id: 'fit-cover-3-4',
    label: 'Whole cover',
    description: 'No cropping',
    aspect: 3 / 4,
    outputWidth: 900,
    outputHeight: 1200,
    mode: 'contain',
  },
];

export const COLORING_PAGE_PHOTO_CROP_PRESETS: CropPreset[] = [
  {
    id: 'fit-page-3-4',
    label: 'Whole page',
    description: 'No cropping',
    aspect: 3 / 4,
    outputWidth: 900,
    outputHeight: 1200,
    mode: 'contain',
  },
  {
    id: 'page-crop-3-4',
    label: 'Tall',
    description: 'Fits most pages',
    aspect: 3 / 4,
    outputWidth: 900,
    outputHeight: 1200,
  },
  {
    id: 'square-1-1',
    label: 'Square',
    description: 'For close-ups',
    aspect: 1,
    outputWidth: 1200,
    outputHeight: 1200,
  },
];

export function isSupportedImageMime(
  type: string | undefined | null
): type is SupportedImageMimeType {
  return !!type && (IMAGE_MIME_TYPES as readonly string[]).includes(type);
}

export function inferImageMimeFromExtension(name: string): SupportedImageMimeType | null {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return ext ? (IMAGE_EXTENSION_TO_MIME[ext] ?? null) : null;
}

export function hasSupportedImageExtension(name: string): boolean {
  return !!inferImageMimeFromExtension(name);
}

export function sanitizeImageFileName(name: string): string {
  return name.replace(/[#?%&=]/g, '_').replace(/\s+/g, '-');
}

export function normalizeImageFile(file: File): File {
  const sanitizedName = sanitizeImageFileName(file.name);
  const inferredType = isSupportedImageMime(file.type)
    ? file.type
    : inferImageMimeFromExtension(sanitizedName);
  const nextType = inferredType ?? file.type;

  if (sanitizedName === file.name && nextType === file.type) {
    return file;
  }

  return new File([file], sanitizedName, {
    type: nextType,
    lastModified: file.lastModified,
  });
}
