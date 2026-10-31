import { useId, useRef } from 'react';
import { Camera, CalendarDays } from 'lucide-react';

import { Textarea } from '@/components/ui/textarea';
import { DateField } from '@/components/ui/date-field';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { formatDateInUserTimezone } from '@/utils/date/timezoneUtils';

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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const timezone = useUserTimezone();
  const today = formatDateInUserTimezone(new Date(), timezone, 'yyyy-MM-dd');
  const captionEditorId = useId();
  const captionErrorId = `${captionEditorId}-error`;
  const isDialogSheet = variant === 'dialog-sheet';

  const cropDialog = (
    <ImageCropDialog
      open={isCropDialogOpen}
      file={cropFile}
      title="Crop progress photo"
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
  );

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

      {cropDialog}

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

  if (variant === 'composer') {
    return (
      <form onSubmit={handleSubmit} className="border-border/60 bg-card rounded-xl border p-3">
        {cropDialog}
        <Textarea
          value={content}
          onChange={event => handleContentChange(event.target.value)}
          disabled={areInputsDisabled}
          placeholder="Add a progress note"
          aria-label="Add a progress note"
          className="min-h-20 resize-y border-0 bg-transparent p-1 shadow-none"
        />
        {imageFile && (
          <ImageUpload
            imageFile={imageFile}
            statusText={imageAnnouncement}
            onChange={handleImageChange}
            onClearImage={handleClearImage}
            onCropImage={handleOpenCropDialog}
            isCompressing={isCompressing}
            compressionProgress={compressionProgress}
            disabled={areInputsDisabled}
            error={errors.image}
          />
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleImageChange}
          disabled={areInputsDisabled}
        />
        <div className="border-border/60 mt-3 flex flex-wrap items-center gap-2 border-t pt-2">
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground min-h-11 px-2"
            disabled={areInputsDisabled}
            onClick={() => {
              if (!fileInputRef.current) return;
              fileInputRef.current.value = '';
              fileInputRef.current.click();
            }}
          >
            <Camera className="size-4" />
            Photo
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="text-muted-foreground min-h-11 px-2"
                disabled={areInputsDisabled}
              >
                <span className="sr-only">Choose progress date: </span>
                <CalendarDays className="size-4" />
                {date === today ? 'Today' : date}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72">
              <DateField
                aria-label="Progress date"
                value={date}
                onChange={handleDateChange}
                calendarLabel="progress date"
                calendarPlacement="inline"
                disabled={areInputsDisabled}
              />
            </PopoverContent>
          </Popover>
          <Button type="submit" className="ml-auto min-h-11" disabled={isFormDisabled}>
            {isCompressing ? 'Preparing photo...' : isSubmitting ? 'Saving...' : 'Save'}
          </Button>
        </div>
        {[errors.date, errors.image, errors.content, errors.form].filter(Boolean).map(error => (
          <p key={error} role="alert" className="text-destructive-text mt-2 text-sm">
            {error}
          </p>
        ))}
      </form>
    );
  }

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
