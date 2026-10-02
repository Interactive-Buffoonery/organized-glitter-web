import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useColoringPageCommand } from '@/hooks/coloring/useColoringPageCommand';
import type { UseColoringPageCommandExecutorResult } from '@/hooks/coloring/useColoringPageCommandExecutor';
import type { ColoringPageDTO } from '@/services/pocketbase/coloring.service';
import { normalizeImageFile } from '@/utils/image/imagePolicy';

export function useColoringPagePhotoManager(
  page: ColoringPageDTO | null | undefined,
  commandExecutor: UseColoringPageCommandExecutorResult
) {
  const runCommand = useColoringPageCommand(commandExecutor);
  const [photoCropFile, setPhotoCropFile] = useState<File | null>(null);
  const [isPhotoCropDialogOpen, setIsPhotoCropDialogOpen] = useState(false);
  const latestPhotosRef = useRef<string[]>(page?.photos ?? []);

  const syncLatestPhotos = useCallback((updatedPage: ColoringPageDTO) => {
    latestPhotosRef.current = updatedPage.photos;
  }, []);

  const closePhotoCropDialog = useCallback(() => {
    setPhotoCropFile(null);
    setIsPhotoCropDialogOpen(false);
  }, []);

  useEffect(() => {
    latestPhotosRef.current = page?.photos ?? [];
  }, [page?.photos]);

  const [prevPageId, setPrevPageId] = useState<string | undefined>(page?.id);
  if (prevPageId !== page?.id) {
    setPrevPageId(page?.id);
    setPhotoCropFile(null);
    setIsPhotoCropDialogOpen(false);
  }

  const uploadProcessedPagePhotos = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return null;

      return runCommand(
        page,
        { type: 'add-photos', files },
        { failureTitle: 'Photo upload failed', onSuccess: syncLatestPhotos }
      );
    },
    [page, runCommand, syncLatestPhotos]
  );

  const handlePhotoUpload = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (!page) return;

      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      setPhotoCropFile(normalizeImageFile(file));
      setIsPhotoCropDialogOpen(true);
    },
    [page]
  );

  const handlePhotoCropDialogOpenChange = useCallback((open: boolean) => {
    setIsPhotoCropDialogOpen(open);
    if (!open) {
      setPhotoCropFile(null);
    }
  }, []);

  const handlePhotoCropComplete = useCallback(
    (file: File) => {
      closePhotoCropDialog();
      void uploadProcessedPagePhotos([file]);
    },
    [closePhotoCropDialog, uploadProcessedPagePhotos]
  );

  const handlePhotoUseOriginal = useCallback(
    (file: File) => {
      closePhotoCropDialog();
      void uploadProcessedPagePhotos([file]);
    },
    [closePhotoCropDialog, uploadProcessedPagePhotos]
  );

  const deletePhoto = useCallback(
    (filename: string) =>
      runCommand(
        page,
        { type: 'delete-photo', filename },
        { failureTitle: 'Photo delete failed', onSuccess: syncLatestPhotos }
      ),
    [page, runCommand, syncLatestPhotos]
  );

  const setMainPhoto = useCallback(
    async (filename: string) => {
      if (latestPhotosRef.current[0] === filename) return null;

      return runCommand(
        page,
        { type: 'set-main-photo', filename },
        { failureTitle: 'Main image did not update', onSuccess: syncLatestPhotos }
      );
    },
    [page, runCommand, syncLatestPhotos]
  );

  return {
    isPending: commandExecutor.isPending,
    photoCropFile,
    isPhotoCropDialogOpen,
    handlePhotoUpload,
    handlePhotoCropDialogOpenChange,
    handlePhotoCropComplete,
    handlePhotoUseOriginal,
    deletePhoto,
    setMainPhoto,
  };
}
