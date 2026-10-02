import { useCallback, useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImageCropDialog } from '@/components/image/ImageCropDialog';
import { useProjectUpdateUnified } from '@/hooks/mutations/useProjectUpdateUnified';
import { useProjectImageCompression } from '@/hooks/useProjectImageCompression';
import { notifyError, notifySuccess } from '@/lib/notifications/notify';
import {
  CROP_OUTPUT_TYPE,
  IMAGE_ACCEPT_ATTRIBUTE,
  PROJECT_IMAGE_CROP_PRESETS,
  hasSupportedImageExtension,
  isSupportedImageMime,
  normalizeImageFile,
} from '@/utils/image/imagePolicy';
import type { ProjectType } from '@/types/project';

interface ProjectCoverImageEditorProps {
  project: ProjectType;
}

const buildPassThroughInput = (project: ProjectType, croppedFile: File) => ({
  projectId: project.id,
  title: project.title,
  status: project.status,
  generalNotes: project.generalNotes,
  sourceUrl: project.sourceUrl,
  datePurchased: project.datePurchased,
  dateStarted: project.dateStarted,
  dateCompleted: project.dateCompleted,
  dateReceived: project.dateReceived,
  drillShape: project.drillShape,
  kitCategory: project.kitCategory,
  width: project.width,
  height: project.height,
  totalDiamonds: project.totalDiamonds,
  imageFile: croppedFile,
  imageRemoved: false,
});

const ProjectCoverImageEditor = ({ project }: ProjectCoverImageEditorProps) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isProcessingRef = useRef(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [isCropDialogOpen, setIsCropDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const updateProject = useProjectUpdateUnified();
  const { compressImage } = useProjectImageCompression();

  const hasImage = Boolean(project.imageUrl);
  const isSubmitting = isProcessing || updateProject.isPending;
  const buttonLabel = hasImage ? 'Replace cover image' : 'Add cover photo';

  const handleSelectFile = useCallback(() => {
    if (isSubmitting) return;
    fileInputRef.current?.click();
  }, [isSubmitting]);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const picked = input.files?.[0];
    input.value = '';
    if (!picked || isProcessingRef.current) return;

    if (!isSupportedImageMime(picked.type) && !hasSupportedImageExtension(picked.name)) {
      notifyError(
        'Unsupported image format',
        'Use JPG, PNG, GIF, WebP, or HEIC for the project cover.'
      );
      return;
    }

    setCropFile(normalizeImageFile(picked));
    setIsCropDialogOpen(true);
  }, []);

  const submitImage = useCallback(
    async (file: File) => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;
      setIsProcessing(true);

      try {
        const compressed = await compressImage(file);
        await updateProject.mutateAsync(buildPassThroughInput(project, compressed));
        notifySuccess('Cover image updated');
        setCropFile(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Please try again.';
        notifyError('Failed to update cover image', message);
      } finally {
        isProcessingRef.current = false;
        setIsProcessing(false);
      }
    },
    [compressImage, project, updateProject]
  );

  const handleCropComplete = useCallback(
    (file: File) => {
      void submitImage(file);
    },
    [submitImage]
  );

  const handleUseOriginal = useCallback(
    (file: File) => {
      void submitImage(file);
    },
    [submitImage]
  );

  return (
    <>
      <Button
        type="button"
        variant={hasImage ? 'glass' : 'default'}
        size={hasImage ? 'icon-sm' : 'default'}
        className={hasImage ? undefined : 'min-h-11'}
        aria-label={hasImage ? buttonLabel : undefined}
        title={hasImage ? buttonLabel : undefined}
        disabled={isSubmitting}
        onClick={handleSelectFile}
      >
        {isSubmitting && <Loader2 className="animate-spin" />}
        {hasImage ? !isSubmitting && <Upload /> : buttonLabel}
      </Button>

      <input
        ref={fileInputRef}
        type="file"
        accept={IMAGE_ACCEPT_ATTRIBUTE}
        className="sr-only"
        onChange={handleFileChange}
        disabled={isSubmitting}
        aria-hidden="true"
        tabIndex={-1}
      />

      <ImageCropDialog
        open={isCropDialogOpen}
        file={cropFile}
        title="Crop project image"
        description="Choose a rectangle, portrait, or square crop, then drag and zoom until the cover looks right."
        aspect={4 / 3}
        outputWidth={1200}
        outputHeight={900}
        outputType={CROP_OUTPUT_TYPE}
        presets={PROJECT_IMAGE_CROP_PRESETS}
        defaultPresetId="rectangle-4-3"
        onOpenChange={setIsCropDialogOpen}
        onCropComplete={handleCropComplete}
        onUseOriginal={handleUseOriginal}
      />
    </>
  );
};

export default ProjectCoverImageEditor;
