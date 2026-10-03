import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { notifyError } from '@/lib/notifications';
import { useImageUpload } from '@/hooks/useImageUpload';
import { useNumberInput } from '@/hooks/useNumberInput';
import { useCompletionDateStatus } from '@/hooks/useCompletionDateStatus';
import { ProjectCoverImageSection } from '@/components/projects/form-sections/ProjectCoverImageSection';
import { ProjectDatesSection } from '@/components/projects/form-sections/ProjectDatesSection';
import { ProjectKitInfoSection } from '@/components/projects/form-sections/ProjectKitInfoSection';
import { ProjectSourceNotesSection } from '@/components/projects/form-sections/ProjectSourceNotesSection';
import { ProjectSpecsSection } from '@/components/projects/form-sections/ProjectSpecsSection';
import { ProjectStatusSection } from '@/components/projects/form-sections/ProjectStatusSection';
import { ProjectTitleSection } from '@/components/projects/form-sections/ProjectTitleSection';
import type { ProjectFormFieldErrors } from '@/schemas/project.schema';
import type { ProjectFormValues } from '@/types/project';
import type { Tag } from '@/types/tag';
import type { CreateCompanyData } from '@/hooks/mutations/useCompanyMutations';
import type { CreateArtistData } from '@/hooks/mutations/useArtistMutations';

const EMPTY_FIELD_ERRORS: ProjectFormFieldErrors = {};

interface ProjectFormSectionsProps {
  formData: ProjectFormValues;
  companies: string[];
  artists: string[];
  isSubmitting: boolean;
  onChange: (data: ProjectFormValues) => void;
  savedDateCompleted?: string | null;
  statusBeforeDateChange?: ProjectFormValues['status'] | null;
  onStatusBeforeDateChange?: (status: ProjectFormValues['status'] | null) => void;
  fieldErrors?: ProjectFormFieldErrors;
  layout?: 'page' | 'drawer';
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
  statusBeforeDateChange,
  onStatusBeforeDateChange,
  fieldErrors = EMPTY_FIELD_ERRORS,
  layout = 'page',
  onDraftCompany,
  onDraftArtist,
}: ProjectFormSectionsProps) => {
  const imageUploadHook = useImageUpload('project-images', 'project-image');
  const { preview, applyProcessedImage } = imageUploadHook;
  const [projectTags, setProjectTags] = useState<Tag[]>(formData.tags || []);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [isCropDialogOpen, setIsCropDialogOpen] = useState(false);
  const formDataRef = useRef(formData);
  const restoredImageFile = useRef(formData.imageFile);
  const imageSelectionVersionRef = useRef(0);
  const remoteCropVersionRef = useRef(0);
  const { statusForStatusChange, statusForDateChange } = useCompletionDateStatus<
    ProjectFormValues['status']
  >('completed', statusBeforeDateChange, onStatusBeforeDateChange);

  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

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
      if (field === 'status') {
        onChange({
          ...formData,
          status: statusForStatusChange(
            value as ProjectFormValues['status'],
            formData.dateCompleted,
            savedDateCompleted
          ),
        });
        return;
      }
      onChange({ ...formData, [field]: value });
    },
    [formData, onChange, savedDateCompleted, statusForStatusChange]
  );

  const handleImageChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const imageSelectionVersion = ++imageSelectionVersionRef.current;
      remoteCropVersionRef.current += 1;
      const file = await imageUploadHook.handleImageChange(event);
      if (file && imageSelectionVersion === imageSelectionVersionRef.current) {
        setCropFile(file);
        setIsCropDialogOpen(true);
        onChange({
          ...formDataRef.current,
          imageFile: file,
          imageRemoved: false,
        });
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
    onChange({
      ...formData,
      imageFile: null,
      imageUrl: '',
      imageRemoved: true,
    });
  }, [formData, imageUploadHook, onChange]);

  const handleOpenCropDialog = useCallback(async () => {
    const remoteCropVersion = ++remoteCropVersionRef.current;
    const localFile = formData.imageFile ?? imageUploadHook.processedFile;
    if (localFile) {
      setCropFile(localFile);
      setIsCropDialogOpen(true);
      return;
    }

    const url = imageUploadHook.preview || formData.imageUrl;
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
  }, [
    formData.imageFile,
    formData.imageUrl,
    imageUploadHook.processedFile,
    imageUploadHook.preview,
  ]);

  const handleCropComplete = useCallback(
    (file: File) => {
      imageUploadHook.applyProcessedImage(file);
      setCropFile(file);
      onChange({
        ...formData,
        imageFile: file,
        imageRemoved: false,
      });
    },
    [formData, imageUploadHook, onChange]
  );

  const handleUseOriginalImage = useCallback(
    (file: File) => {
      imageUploadHook.applyProcessedImage(file);
      setCropFile(file);
      onChange({
        ...formData,
        imageFile: file,
        imageRemoved: false,
      });
    },
    [formData, imageUploadHook, onChange]
  );

  const handleTagsChange = useCallback(
    (tags: Tag[]) => {
      setProjectTags(tags);
      onChange({ ...formData, tags });
    },
    [formData, onChange]
  );

  const handleDateChange = useCallback(
    (field: keyof ProjectFormValues, value: string) => {
      if (field === 'dateCompleted') {
        onChange({
          ...formData,
          dateCompleted: value,
          status: statusForDateChange(
            value,
            formData.dateCompleted,
            formData.status,
            savedDateCompleted
          ),
        });
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
  const isDrawerLayout = layout === 'drawer';

  const statusSection = (
    <ProjectStatusSection
      formData={formData}
      isSubmitting={isSubmitting}
      fieldErrors={fieldErrors}
      onFieldChange={handleInputChange}
    />
  );
  const kitInfoSection = (
    <ProjectKitInfoSection
      formData={formData}
      companies={companies}
      artists={artists}
      isSubmitting={isSubmitting}
      projectTags={projectTags}
      fieldErrors={fieldErrors}
      onFieldChange={handleInputChange}
      onTagsChange={handleTagsChange}
      onDraftCompany={onDraftCompany}
      onDraftArtist={onDraftArtist}
    />
  );

  return (
    <>
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
        <ProjectTitleSection
          formData={formData}
          isSubmitting={isSubmitting}
          fieldErrors={fieldErrors}
          onFieldChange={handleInputChange}
        />
      </div>

      {isDrawerLayout ? (
        <>
          {statusSection}
          {kitInfoSection}
        </>
      ) : null}

      <main className="order-3 min-w-0 lg:order-none lg:col-start-1 lg:row-start-2">
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
      </main>

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

        {isDrawerLayout ? null : statusSection}

        {isDrawerLayout ? null : kitInfoSection}
      </aside>
    </>
  );
};

export default ProjectFormSections;
