import { useState, useCallback } from 'react';
import { useProgressImageCompression } from './useProgressImageCompression';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { getCurrentDateInUserTimezone } from '@/utils/date/timezoneUtils';
import { logger } from '@/utils/logger';
import {
  ProgressNoteFormProps as UseProgressNoteFormProps,
  ProgressNoteFormErrors,
} from '@/components/projects/ProgressNoteForm/types';
import { PROGRESS_NOTE_MAX_FILE_SIZE } from '@/components/projects/ProgressNoteForm/constants';
import {
  hasSupportedImageExtension,
  isSupportedImageMime,
  normalizeImageFile,
} from '@/utils/image/imagePolicy';
import type { MarkdownString } from '@/types/markdown';

interface SubmitProgressNoteData {
  date: string;
  content: MarkdownString;
  imageFile?: File;
}

/**
 * Custom hook to manage the state, validation, and submission logic for the progress note form.
 * It integrates tracking and image compression functionalities.
 *
 * @param {UseProgressNoteFormProps} props - Props for the hook, including onSubmit, onSuccess, and disabled state.
 * @returns An object containing form state, handlers, validation status, and utility functions.
 */
export const useProgressNoteForm = ({
  onSubmit,
  onSuccess,
  disabled = false,
}: UseProgressNoteFormProps) => {
  const userTimezone = useUserTimezone();
  const [date, setDate] = useState<string>(() => getCurrentDateInUserTimezone(userTimezone));
  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageAnnouncement, setImageAnnouncement] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [isCropDialogOpen, setIsCropDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<ProgressNoteFormErrors>({});

  const { compressImage, isCompressing, compressionProgress, resetCompressionState } =
    useProgressImageCompression();

  const resetForm = useCallback(() => {
    setContent('');
    setImageFile(null);
    setImageAnnouncement(null);
    setCropFile(null);
    setIsCropDialogOpen(false);
    setDate(getCurrentDateInUserTimezone(userTimezone));
    setErrors({});
    resetCompressionState();
  }, [resetCompressionState, userTimezone]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const currentValidationErrors: ProgressNoteFormErrors = {};
      if (!date) {
        currentValidationErrors.date = 'Date is required';
      }
      if (errors.image) {
        // Preserve existing image error from handleImageChange
        currentValidationErrors.image = errors.image;
      }

      if (Object.keys(currentValidationErrors).length > 0) {
        setErrors(currentValidationErrors);

        return;
      }
      // If we pass this point, field-specific validations are okay, clear them but preserve form error if any
      setErrors(prevErrors => ({ form: prevErrors.form }));

      setIsSubmitting(true);
      try {
        const noteDataToSubmit: SubmitProgressNoteData = {
          date: date,
          content: content.trim(),
          imageFile: imageFile || undefined,
        };

        const saved = await onSubmit(noteDataToSubmit);
        if (!saved) {
          setErrors({ form: 'Could not add the progress note. Please try again.' });
          return;
        }
        resetForm();
        if (onSuccess) {
          onSuccess();
        }
      } catch (error) {
        logger.error('Error submitting progress note:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'An unexpected error occurred.';
        setErrors({ form: errorMessage });
      } finally {
        setIsSubmitting(false);
      }
    },
    [date, content, imageFile, onSubmit, onSuccess, resetForm, errors.image]
  );

  const handleImageChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0] || null;
      setImageAnnouncement(null);

      if (!selectedFile) {
        setImageFile(null);
        setErrors((prev: ProgressNoteFormErrors) => ({
          ...prev,
          image: undefined,
          form: undefined,
        }));
        return;
      }

      if (
        !isSupportedImageMime(selectedFile.type) &&
        !hasSupportedImageExtension(selectedFile.name)
      ) {
        setErrors((prev: ProgressNoteFormErrors) => ({
          ...prev,
          image: `Invalid file type "${selectedFile.type || 'unknown'}". Please select a JPG, PNG, GIF, WebP, or HEIC image.`,
          form: undefined,
        }));
        setImageFile(null);
        return;
      }

      if (selectedFile.size > PROGRESS_NOTE_MAX_FILE_SIZE) {
        const fileSizeMB = Math.round((selectedFile.size / (1024 * 1024)) * 100) / 100;
        setErrors((prev: ProgressNoteFormErrors) => ({
          ...prev,
          image: `Image is ${fileSizeMB}MB, exceeds 50MB limit.`,
          form: undefined,
        }));
        setImageFile(null);
        return;
      }

      try {
        const normalizedFile = normalizeImageFile(selectedFile);
        const processedFile = await compressImage(normalizedFile);
        setImageFile(processedFile);
        setCropFile(processedFile);
        setIsCropDialogOpen(true);
        setErrors((prev: ProgressNoteFormErrors) => ({
          ...prev,
          image: undefined,
          form: undefined,
        }));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Image processing failed.';
        setErrors((prev: ProgressNoteFormErrors) => ({
          ...prev,
          image: errorMessage,
          form: undefined,
        }));
        if (error instanceof Error && error.message.includes('exceeds 50MB limit')) {
          setImageFile(null);
        }
      }
    },
    [compressImage]
  );

  const handleDateChange = useCallback(
    (newDate: string) => {
      setDate(newDate);
      if (errors.date || errors.form) {
        setErrors((prev: ProgressNoteFormErrors) => ({
          ...prev,
          date: undefined,
          form: undefined,
        }));
      }
    },
    [errors.date, errors.form]
  );

  const handleContentChange = useCallback(
    (newContent: MarkdownString) => {
      setContent(newContent);
      if (errors.content || errors.form) {
        setErrors((prev: ProgressNoteFormErrors) => ({
          ...prev,
          content: undefined,
          form: undefined,
        }));
      }
    },
    [errors.content, errors.form]
  );

  const handleClearImage = useCallback(() => {
    setImageFile(null);
    setImageAnnouncement(null);
    setCropFile(null);
    setIsCropDialogOpen(false);
    setErrors((prev: ProgressNoteFormErrors) => ({ ...prev, image: undefined, form: undefined }));
  }, []);

  const handleOpenCropDialog = useCallback(() => {
    if (!imageFile) return;

    setImageAnnouncement(null);
    setCropFile(imageFile);
    setIsCropDialogOpen(true);
  }, [imageFile]);

  const handleCropComplete = useCallback((file: File) => {
    setImageFile(file);
    setCropFile(file);
    setErrors((prev: ProgressNoteFormErrors) => ({
      ...prev,
      image: undefined,
      form: undefined,
    }));
  }, []);

  const handleUseOriginalImage = useCallback((file: File) => {
    setImageFile(file);
    setCropFile(file);
    setErrors((prev: ProgressNoteFormErrors) => ({
      ...prev,
      image: undefined,
      form: undefined,
    }));
  }, []);

  const handleCropDialogClosed = useCallback(() => {
    setImageAnnouncement(imageFile ? `Photo selected: ${imageFile.name}` : null);
  }, [imageFile]);

  // Updated isFormValid to reflect that content is optional
  const isFormValid = Boolean(date && !errors.date && !errors.image);
  // Renamed original isFormDisabled to shouldDisableSubmit for clarity
  const shouldDisableSubmit = disabled || isSubmitting || isCompressing || !isFormValid;
  // New state for disabling inputs specifically
  const areInputsDisabled = disabled || isSubmitting || isCompressing;

  return {
    date,
    content,
    imageFile,
    imageAnnouncement,
    cropFile,
    isCropDialogOpen,
    errors,
    isSubmitting,
    isCompressing,
    compressionProgress,
    handleSubmit,
    handleImageChange,
    handleDateChange,
    handleContentChange,
    handleClearImage,
    handleOpenCropDialog,
    handleCropComplete,
    handleUseOriginalImage,
    handleCropDialogClosed,
    setIsCropDialogOpen,
    isFormDisabled: shouldDisableSubmit, // Keep isFormDisabled for the submit button, maps to shouldDisableSubmit
    areInputsDisabled, // Add this for input fields
    resetForm,
  };
};
