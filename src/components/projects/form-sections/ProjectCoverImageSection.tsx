import type { ChangeEvent } from 'react';
import { ImageCropDialog } from '@/components/image/ImageCropDialog';
import { PROJECT_IMAGE_CROP_PRESETS } from '@/utils/image/imagePolicy';
import { ProjectImageDropzone } from './ProjectImageDropzone';
import { Section } from './ProjectFormSectionPrimitives';

interface ProjectCoverImageSectionProps {
  imageUrl: string;
  isUploading: boolean;
  uploadError?: string | null;
  selectedFileName?: string;
  cropFile: File | null;
  isCropDialogOpen: boolean;
  onImageChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onImageRemove: () => void;
  onCropImage: () => void;
  onCropDialogOpenChange: (open: boolean) => void;
  onCropComplete: (file: File) => void;
  onUseOriginalImage: (file: File) => void;
}

export const ProjectCoverImageSection = ({
  imageUrl,
  isUploading,
  uploadError,
  selectedFileName,
  cropFile,
  isCropDialogOpen,
  onImageChange,
  onImageRemove,
  onCropImage,
  onCropDialogOpenChange,
  onCropComplete,
  onUseOriginalImage,
}: ProjectCoverImageSectionProps) => (
  <Section label="Cover Image" flush="lg">
    <ProjectImageDropzone
      imageUrl={imageUrl}
      isUploading={isUploading}
      uploadError={uploadError}
      selectedFileName={selectedFileName}
      onImageChange={onImageChange}
      onImageRemove={onImageRemove}
      onCropImage={onCropImage}
    />

    <ImageCropDialog
      open={isCropDialogOpen}
      file={cropFile}
      title="Crop project image"
      description="Choose a rectangle or square crop, then drag and zoom until the cover looks right."
      aspect={4 / 3}
      outputWidth={1200}
      outputHeight={900}
      presets={PROJECT_IMAGE_CROP_PRESETS}
      defaultPresetId="rectangle-4-3"
      onOpenChange={onCropDialogOpenChange}
      onCropComplete={onCropComplete}
      onUseOriginal={onUseOriginalImage}
    />
  </Section>
);
