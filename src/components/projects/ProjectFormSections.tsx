import type { ProjectFormUpdate } from '@/hooks/useProjectFormState';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { notifyError } from '@/lib/notifications';
import { usePrivateFileUrl } from '@/hooks/usePrivateFileUrl';
import { useImageUpload } from '@/hooks/useImageUpload';
import { useNumberInput } from '@/hooks/useNumberInput';
import { useCompletionStatusConfirmation } from '@/hooks/useCompletionStatusConfirmation';
import {
  completionStatusForChange,
  hasNewCompletionDate,
  useCompletionDateStatus,
} from '@/hooks/useCompletionDateStatus';
import { ProjectCoverImageSection } from '@/components/projects/form-sections/ProjectCoverImageSection';
import { ProjectDatesSection } from '@/components/projects/form-sections/ProjectDatesSection';
import { ProjectKitInfoSection } from '@/components/projects/form-sections/ProjectKitInfoSection';
import { ProjectSourceNotesSection } from '@/components/projects/form-sections/ProjectSourceNotesSection';
import { ProjectSpecsSection } from '@/components/projects/form-sections/ProjectSpecsSection';
import { ProjectStatusSection } from '@/components/projects/form-sections/ProjectStatusSection';
import { ProjectTitleSection } from '@/components/projects/form-sections/ProjectTitleSection';
import type { ProjectFormFieldErrors } from '@/schemas/project.schema';
import type { ProjectFormValues } from '@/types/project';
import { InlineTagManager } from '@/components/tags/InlineTagManager';
import type { Tag } from '@/types/tag';
import type { CreateCompanyData } from '@/hooks/mutations/useCompanyMutations';
import type { CreateArtistData } from '@/hooks/mutations/useArtistMutations';

import { Section } from './form-sections/ProjectFormSectionPrimitives';

const EMPTY_FIELD_ERRORS: ProjectFormFieldErrors = {};

interface ProjectFormSectionsProps {
  formData: ProjectFormValues;
  companies: string[];
  artists: string[];
  isSubmitting: boolean;
  onChange: (update: ProjectFormUpdate) => void;
  savedDateCompleted?: string | null;
  savedStatus?: ProjectFormValues['status'];
  statusBeforeDateChange?: ProjectFormValues['status'] | null;
  onStatusBeforeDateChange?: (status: ProjectFormValues['status'] | null) => void;
  fieldErrors?: ProjectFormFieldErrors;
  onDraftCompany?: (data: CreateCompanyData) => void;
  onDraftArtist?: (data: CreateArtistData) => void;
}

const ProjectFormSections = ({
  formData,
  companies,
  artists,
  isSubmitting,
  onChange,
  savedDateCompleted,
  savedStatus,
  statusBeforeDateChange,
  onStatusBeforeDateChange,
  fieldErrors = EMPTY_FIELD_ERRORS,
  onDraftCompany,
  onDraftArtist,
}: ProjectFormSectionsProps) => {
  const { requestChange, dialog, triggerRef } = useCompletionStatusConfirmation();
  const imageUploadHook = useImageUpload('project-images', 'project-image');
  const { preview, applyProcessedImage } = imageUploadHook;
  const cropSourceUrl = usePrivateFileUrl(preview || formData.imageUrl);
  const [projectTags, setProjectTags] = useState<Tag[]>(formData.tags || []);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [isCropDialogOpen, setIsCropDialogOpen] = useState(false);
  const restoredImageFile = useRef(formData.imageFile);
  const imageSelectionVersionRef = useRef(0);
  const remoteCropVersionRef = useRef(0);
  const { statusForStatusChange, statusForDateChange } = useCompletionDateStatus<
    ProjectFormValues['status']
  >('completed', statusBeforeDateChange, onStatusBeforeDateChange);

  useEffect(() => {
    if (
      restoredImageFile.current &&
      formData.imageFile === restoredImageFile.current &&
      !formData.imageRemoved &&
      !preview
    ) {
      applyProcessedImage(restoredImageFile.current);
    }
  }, [formData.imageFile, formData.imageRemoved, preview, applyProcessedImage]);

  useEffect(() => {
    remoteCropVersionRef.current += 1;
  }, [formData.imageFile, formData.imageUrl]);

  useEffect(() => {
    setProjectTags(formData.tags || []);
  }, [formData.tags]);

  const handleInputChange = useCallback(
    (field: keyof ProjectFormValues, value: ProjectFormValues[keyof ProjectFormValues]) => {
      if (field !== 'status') {
        onChange(previous => ({ ...previous, [field]: value }));
        return;
      }
      const { status, dateCompleted } = formData;
      const next = statusForStatusChange(
        value as ProjectFormValues['status'],
        dateCompleted,
        savedDateCompleted
      );
      const applyStatus = () =>
        onChange(previous =>
          previous.status !== status
            ? previous
            : {
                ...previous,
                status: completionStatusForChange(
                  value as ProjectFormValues['status'],
                  previous.dateCompleted,
                  savedDateCompleted,
                  'completed'
                ),
              }
        );
      void requestChange(status, next, dateCompleted, applyStatus, savedStatus ?? '');
    },
    [formData, requestChange, onChange, savedDateCompleted, savedStatus, statusForStatusChange]
  );

  const handleImageChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const imageSelectionVersion = ++imageSelectionVersionRef.current;
      remoteCropVersionRef.current += 1;
      const file = await imageUploadHook.handleImageChange(event);
      if (file && imageSelectionVersion === imageSelectionVersionRef.current) {
        setCropFile(file);
        setIsCropDialogOpen(true);
        onChange(previous => ({
          ...previous,
          imageFile: file,
          imageRemoved: false,
        }));
      }
    },
    [imageUploadHook, onChange]
  );

  const handleImageRemove = useCallback(() => {
    imageSelectionVersionRef.current += 1;
    remoteCropVersionRef.current += 1;
    restoredImageFile.current = null;
    imageUploadHook.handleImageRemove();
    setCropFile(null);
    setIsCropDialogOpen(false);
    onChange(previous => ({
      ...previous,
      imageFile: null,
      imageUrl: '',
      imageRemoved: true,
    }));
  }, [imageUploadHook, onChange]);

  const handleOpenCropDialog = useCallback(async () => {
    const remoteCropVersion = ++remoteCropVersionRef.current;
    const localFile = formData.imageFile ?? imageUploadHook.processedFile;
    if (localFile) {
      setCropFile(localFile);
      setIsCropDialogOpen(true);
      return;
    }

    const url = cropSourceUrl;
    if (!url) return;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (remoteCropVersion !== remoteCropVersionRef.current) return;
      const filename = url.split('/').pop()?.split('?')[0] || 'project-image';
      const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
      setCropFile(file);
      setIsCropDialogOpen(true);
    } catch (err) {
      if (remoteCropVersion !== remoteCropVersionRef.current) return;
      notifyError(
        'Could not load image for cropping',
        err instanceof Error ? err.message : 'Try replacing the image and cropping again.'
      );
    }
  }, [formData.imageFile, imageUploadHook.processedFile, cropSourceUrl]);

  const handleCropComplete = useCallback(
    (file: File) => {
      imageUploadHook.applyProcessedImage(file);
      setCropFile(file);
      onChange(previous => ({
        ...previous,
        imageFile: file,
        imageRemoved: false,
      }));
    },
    [imageUploadHook, onChange]
  );

  const handleUseOriginalImage = useCallback(
    (file: File) => {
      imageUploadHook.applyProcessedImage(file);
      setCropFile(file);
      onChange(previous => ({
        ...previous,
        imageFile: file,
        imageRemoved: false,
      }));
    },
    [imageUploadHook, onChange]
  );

  const handleTagsChange = useCallback(
    (tags: Tag[]) => {
      setProjectTags(tags);
      onChange(previous => ({ ...previous, tags }));
    },
    [onChange]
  );

  const handleDateChange = useCallback(
    (field: keyof ProjectFormValues, value: string) => {
      if (field === 'dateCompleted') {
        const status = statusForDateChange(
          value,
          formData.dateCompleted,
          formData.status,
          savedDateCompleted
        );
        onChange(previous => ({
          ...previous,
          dateCompleted: value,
          status,
        }));
        return;
      }
      handleInputChange(field, value || null);
    },
    [formData, handleInputChange, onChange, savedDateCompleted, statusForDateChange]
  );

  const totalDiamondsProps = useNumberInput(value => handleInputChange('totalDiamonds', value));
  const colorCountProps = useNumberInput(value => handleInputChange('colorCount', value));
  const widthProps = useNumberInput(value => handleInputChange('width', value));
  const heightProps = useNumberInput(value => handleInputChange('height', value));

  const statusSection = (
    <ProjectStatusSection
      triggerRef={triggerRef}
      formData={formData}
      isSubmitting={isSubmitting}
      fieldErrors={fieldErrors}
      completionDateHint={Boolean(
        hasNewCompletionDate(formData.dateCompleted, savedDateCompleted) &&
        formData.status === 'completed'
      )}
      onFieldChange={handleInputChange}
    />
  );
  const kitInfoSection = (
    <ProjectKitInfoSection
      formData={formData}
      companies={companies}
      artists={artists}
      isSubmitting={isSubmitting}
      fieldErrors={fieldErrors}
      onFieldChange={handleInputChange}
      onDraftCompany={onDraftCompany}
      onDraftArtist={onDraftArtist}
    />
  );

  return (
    <>
      {dialog}
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
        <Section label="Basics" flush="always">
          <ProjectTitleSection
            formData={formData}
            isSubmitting={isSubmitting}
            fieldErrors={fieldErrors}
            onFieldChange={handleInputChange}
          />
          {kitInfoSection}
        </Section>
      </div>

      <aside className="order-2 lg:order-none lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <ProjectCoverImageSection
          imageUrl={imageUploadHook.preview || formData.imageUrl || ''}
          isUploading={imageUploadHook.uploading}
          uploadError={fieldErrors.imageFile || imageUploadHook.error}
          selectedFileName={imageUploadHook.file?.name}
          cropFile={cropFile}
          isCropDialogOpen={isCropDialogOpen}
          onImageChange={handleImageChange}
          onImageRemove={handleImageRemove}
          onCropImage={handleOpenCropDialog}
          onCropDialogOpenChange={setIsCropDialogOpen}
          onCropComplete={handleCropComplete}
          onUseOriginalImage={handleUseOriginalImage}
        />

        {statusSection}
        <Section label="Tags">
          <InlineTagManager
            initialTags={projectTags}
            onTagsChange={handleTagsChange}
            className={`[&_button]:min-h-11 ${isSubmitting ? 'pointer-events-none opacity-50' : ''}`}
          />
        </Section>
      </aside>
      <div className="order-3 min-w-0 lg:order-none lg:col-start-1 lg:row-start-2">
        <ProjectSpecsSection
          formData={formData}
          isSubmitting={isSubmitting}
          fieldErrors={fieldErrors}
          totalDiamondsProps={totalDiamondsProps}
          colorCountProps={colorCountProps}
          widthProps={widthProps}
          heightProps={heightProps}
          onFieldChange={handleInputChange}
        />

        <ProjectDatesSection
          formData={formData}
          isSubmitting={isSubmitting}
          fieldErrors={fieldErrors}
          onDateChange={handleDateChange}
        />

        <ProjectSourceNotesSection
          formData={formData}
          isSubmitting={isSubmitting}
          fieldErrors={fieldErrors}
          onFieldChange={handleInputChange}
        />
      </div>
    </>
  );
};

export default ProjectFormSections;
