import { useId } from 'react';

import { Button } from '@/components/ui/button';
import { ImageCropDialog } from '@/components/image/ImageCropDialog';
import RichTextEditor from '@/components/notes/RichTextEditor.lazy';
import { Label } from '@/components/ui/label';
import { useProgressNoteForm } from '@/hooks/useProgressNoteForm';
import { PROGRESS_NOTE_CROP_PRESETS } from '@/utils/image/imagePolicy';

import { DateInput } from './ProgressNoteForm/DateInput';
import { ImageUpload } from './ProgressNoteForm/ImageUpload';
import type { ProgressNoteFormProps } from './ProgressNoteForm/types';

const ProgressNoteForm = ({
  onSubmit,
  onSuccess,
  disabled = false,
  variant = 'default',
}: ProgressNoteFormProps) => {
  const {
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
    isFormDisabled,
    areInputsDisabled,
  } = useProgressNoteForm({ onSubmit, onSuccess, disabled });

  const captionEditorId = useId();
  const captionErrorId = `${captionEditorId}-error`;
  const isDialogSheet = variant === 'dialog-sheet';

  const formFields = (
    <>
      <DateInput
        value={date}
        onChange={handleDateChange}
        disabled={areInputsDisabled}
        error={errors.date}
      />

      <ImageUpload
        imageFile={imageFile}
        statusText={imageAnnouncement}
        onChange={handleImageChange}
        onClearImage={handleClearImage}
        isCompressing={isCompressing}
        compressionProgress={compressionProgress}
        disabled={areInputsDisabled}
        error={errors.image}
        onCropImage={handleOpenCropDialog}
      />

      <ImageCropDialog
        open={isCropDialogOpen}
        file={cropFile}
        title="Crop progress photo"
        description="Choose a rectangle or square crop, then drag and zoom until the progress photo looks right."
        aspect={4 / 3}
        outputWidth={1200}
        outputHeight={900}
        presets={PROGRESS_NOTE_CROP_PRESETS}
        defaultPresetId="fit-4-3"
        onOpenChange={setIsCropDialogOpen}
        onCropComplete={handleCropComplete}
        onUseOriginal={handleUseOriginalImage}
        onAfterClose={handleCropDialogClosed}
      />

      <div className="space-y-2">
        <Label htmlFor={captionEditorId}>Caption (optional)</Label>
        <RichTextEditor
          id={captionEditorId}
          value={content}
          onChange={handleContentChange}
          disabled={areInputsDisabled}
          placeholder="Add a caption for your progress picture..."
          ariaInvalid={Boolean(errors.content)}
          ariaDescribedBy={errors.content ? captionErrorId : undefined}
        />
        {errors.content && (
          <p id={captionErrorId} role="alert" className="text-destructive-text mt-1 text-sm">
            {errors.content}
          </p>
        )}
      </div>

      {errors.form && (
        <p role="alert" className="text-destructive-text text-sm font-medium">
          {errors.form}
        </p>
      )}
    </>
  );

  const submitButton = (
    <Button
      type="submit"
      variant="glass"
      disabled={isFormDisabled}
      className={isDialogSheet ? 'w-full' : undefined}
    >
      {isCompressing ? 'Compressing Image...' : isSubmitting ? 'Adding...' : 'Add Note'}
    </Button>
  );

  if (isDialogSheet) {
    return (
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pt-4 pb-6">{formFields}</div>
        <div className="bg-card shrink-0 border-t px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {submitButton}
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {formFields}
      <div>{submitButton}</div>
    </form>
  );
};

export default ProgressNoteForm;
