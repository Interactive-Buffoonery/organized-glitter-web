import { describe, expect, it } from 'vitest';
import { isImageMimeRejection, isRecordInUseError } from '../errors';
import type { ServiceError } from '../types';

describe('isImageMimeRejection', () => {
  it('matches a PocketBase validation_invalid_mime_type on the image field', () => {
    const error: ServiceError = {
      type: 'validation',
      message: 'Failed to update record.',
      status: 400,
      fieldErrors: {
        image:
          '"photo.jpg" mime type must be one of: image/png, image/jpeg, image/gif, image/webp, image/heic, image/heif.',
      },
      retryable: false,
    };
    const result = isImageMimeRejection(error);
    expect(result).not.toBeNull();
    expect(result!.message).toContain('mime type must be one of');
  });

  it('returns null when the failing field is something other than image', () => {
    const error: ServiceError = {
      type: 'validation',
      message: 'Failed to update record.',
      status: 400,
      fieldErrors: { title: 'title is required' },
      retryable: false,
    };
    expect(isImageMimeRejection(error)).toBeNull();
  });

  it('returns null when the image field error is unrelated to MIME type', () => {
    const error: ServiceError = {
      type: 'validation',
      message: 'Failed to update record.',
      status: 400,
      fieldErrors: { image: 'file too large' },
      retryable: false,
    };
    expect(isImageMimeRejection(error)).toBeNull();
  });

  it('returns null when there are no fieldErrors', () => {
    const error: ServiceError = {
      type: 'validation',
      message: 'Failed to update record.',
      status: 400,
      retryable: false,
    };
    expect(isImageMimeRejection(error)).toBeNull();
  });

  it('returns null for a plain Error', () => {
    expect(isImageMimeRejection(new Error('nope'))).toBeNull();
  });
});

describe('isRecordInUseError', () => {
  it('matches both raw and normalized taxonomy guard errors', () => {
    expect(isRecordInUseError(new Error('This list item is still in use.'))).toBe(true);
    expect(
      isRecordInUseError({
        type: 'validation',
        message: 'Please check your input and try again.',
        status: 400,
        fieldErrors: { id: 'Remove it from existing records before deleting it.' },
        retryable: false,
      } satisfies ServiceError)
    ).toBe(true);
    expect(
      isRecordInUseError({
        type: 'validation',
        message: 'Please check your input and try again.',
        status: 400,
        retryable: false,
        cause: new Error(
          'Failed to delete record. Make sure that the record is not part of a required relation reference.'
        ),
      } satisfies ServiceError)
    ).toBe(true);
    expect(isRecordInUseError(new Error('Network connection failed.'))).toBe(false);
  });
});
