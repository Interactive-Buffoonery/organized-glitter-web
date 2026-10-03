/**
 * Utility for building FormData objects for PocketBase API calls
 * Handles proper type preservation and file uploads
 * @author @serabi
 * @created 2025-07-04
 */

import type { ProjectUpdateData } from '@/types/file-upload';
import { IMAGE_MAX_FILE_SIZE_BYTES, IMAGE_MIME_TYPES } from '@/utils/image/imagePolicy';
import { createLogger } from '@/utils/logger';

const logger = createLogger('FormDataBuilder');

/**
 * Builds FormData for PocketBase update operations
 * Preserves proper data types instead of converting everything to strings
 *
 * Image field handling:
 * - `imageFile` present → upload the new file (PocketBase auto-deletes the old one)
 * - `imageRemoved` true with no `imageFile` → write empty string to detach the
 *   existing file so PocketBase reclaims its storage
 * - neither → omit the `image` field, leaving the existing image untouched
 */
export function buildFormDataForUpdate(
  data: ProjectUpdateData,
  imageFile?: File,
  imageRemoved?: boolean
): FormData {
  const formData = new FormData();

  // Add all non-file fields with proper type preservation
  Object.entries(data).forEach(([key, value]) => {
    if (key === 'image') return; // Skip image field, handle separately

    // Only add non-null, non-undefined, non-empty values
    if (value !== undefined && value !== null && value !== '') {
      // For PocketBase FormData, we need to convert to string but preserve meaningful values
      if (typeof value === 'boolean') {
        formData.append(key, value.toString());
      } else if (typeof value === 'number') {
        formData.append(key, value.toString());
      } else if (typeof value === 'string') {
        formData.append(key, value);
      } else {
        // For any other type, convert to JSON string
        formData.append(key, JSON.stringify(value));
      }
    }
  });

  if (imageFile) {
    formData.append('image', imageFile);
  } else if (imageRemoved) {
    formData.append('image', '');
  }

  return formData;
}

/**
 * Validates FormData before sending to PocketBase
 * Ensures all required fields are present and files are valid
 */
export function validateFormDataForUpdate(
  formData: FormData,
  requiredFields: string[] = []
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required fields
  for (const field of requiredFields) {
    if (!formData.has(field)) {
      errors.push(`Required field '${field}' is missing`);
    }
  }

  // Validate file if present
  const imageFile = formData.get('image');
  if (imageFile && imageFile instanceof File) {
    if (imageFile.size > IMAGE_MAX_FILE_SIZE_BYTES) {
      errors.push(`Image file size cannot exceed ${IMAGE_MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`);
    }

    if (!(IMAGE_MIME_TYPES as readonly string[]).includes(imageFile.type)) {
      errors.push(
        `Invalid file type: ${imageFile.type}. Allowed types: ${IMAGE_MIME_TYPES.join(', ')}`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Logs FormData contents for debugging (safely handles File objects)
 */
export function logFormData(formData: FormData, label: string = 'FormData'): void {
  if (import.meta.env.DEV) {
    logger.debug(`[Debug] ${label} - FormData contents:`);
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        logger.debug(
          `${key}: [File: ${value.name}, size: ${value.size} bytes, type: ${value.type}]`
        );
      } else {
        logger.debug(`${key}: ${value}`);
      }
    }
  }
}
