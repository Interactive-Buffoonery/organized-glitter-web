import { useId, useRef } from 'react';
import { Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { DateField } from '@/components/ui/date-field';
import { ImageCropDialog } from '@/components/image/ImageCropDialog';
import { ImageUpload } from '@/components/projects/ProgressNoteForm/ImageUpload';
import { useProgressNoteForm } from '@/hooks/useProgressNoteForm';
import type { ProgressNoteFormProps } from '@/components/projects/ProgressNoteForm/types';
import { PROGRESS_NOTE_CROP_PRESETS } from '@/utils/image/imagePolicy';

export function ProgressNoteComposer({ onSubmit, disabled }: ProgressNoteFormProps) {
  const form = useProgressNoteForm({ onSubmit, disabled });
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  return (
    <form
      aria-label="Add a progress note"
      onSubmit={form.handleSubmit}
      className="border-border/60 bg-card space-y-3 rounded-xl border p-3"
    >
      <Textarea
        aria-label="Progress note"
        placeholder="Add a progress note"
        value={form.content}
        onChange={event => form.handleContentChange(event.target.value)}
        disabled={form.areInputsDisabled}
        className="min-h-20 resize-y border-0 bg-transparent px-1 shadow-none"
      />
      {form.imageFile && (
        <ImageUpload
          imageFile={form.imageFile}
          statusText={form.imageAnnouncement}
          onChange={form.handleImageChange}
          onClearImage={form.handleClearImage}
          isCompressing={form.isCompressing}
          compressionProgress={form.compressionProgress}
          disabled={form.areInputsDisabled}
          onCropImage={form.handleOpenCropDialog}
        />
      )}
      <div className="border-border/60 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            accept="image/*"
            aria-label="Progress photo"
            className="sr-only"
            tabIndex={-1}
            disabled={form.areInputsDisabled}
            onChange={form.handleImageChange}
          />
          <Button
            type="button"
            variant="ghost"
            size="touch"
            className="px-2"
            disabled={form.areInputsDisabled}
            onClick={() => input.current?.click()}
          >
            <Camera className="size-4" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Photo</span>
          </Button>
          <label htmlFor={id} className="sr-only">
            Progress date
          </label>
          <DateField
            id={id}
            value={form.date}
            onChange={form.handleDateChange}
            disabled={form.areInputsDisabled}
            calendarLabel="Progress date"
            className="w-36 [&_input]:min-h-11"
          />
        </div>
        <Button
          type="submit"
          size="touch"
          disabled={form.isFormDisabled || (!form.content.trim() && !form.imageFile)}
        >
          {form.isSubmitting ? 'Saving…' : 'Save'}
        </Button>
      </div>
      {Object.entries(form.errors).map(
        ([field, error]) =>
          error && (
            <p key={field} role="alert" className="text-destructive-text text-sm">
              {error}
            </p>
          )
      )}
      <ImageCropDialog
        open={form.isCropDialogOpen}
        file={form.cropFile}
        title="Crop progress photo"
        description="Fit the whole photo, or crop a detail."
        aspect={4 / 3}
        outputWidth={1200}
        outputHeight={900}
        presets={PROGRESS_NOTE_CROP_PRESETS}
        defaultPresetId="fit-4-3"
        onOpenChange={form.setIsCropDialogOpen}
        onCropComplete={form.handleCropComplete}
        onUseOriginal={form.handleUseOriginalImage}
        onAfterClose={form.handleCropDialogClosed}
      />
    </form>
  );
}
