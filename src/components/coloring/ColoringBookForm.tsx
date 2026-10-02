import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, RefObject } from 'react';
import { ImageCropDialog } from '@/components/image/ImageCropDialog';
import { useCompletionDateStatus } from '@/hooks/useCompletionDateStatus';
import { ColoringBooksStatusOptions } from '@/types/pocketbase.types';
import {
  validateColoringBookForm,
  type ColoringBookFormFieldErrors,
  type ColoringBookSubmitValues,
  type ColoringBookFormValues,
} from '@/schemas/coloring/coloringBook.schema';
import type { BookIllustratorListItem } from '@/services/pocketbase/bookIllustrators.service';
import type { BookPublisherListItem } from '@/services/pocketbase/bookPublishers.service';
import type { ColoringBookDTO } from '@/services/pocketbase/coloring.service';
import type { Tag } from '@/types/tag';
import { ProjectFormFooter } from '@/components/projects/form/ProjectFormFooter';
import { cn } from '@/lib/utils';
import { COLORING_BOOK_MAX_PAGES } from '@/constants/coloringBookMetadata';
import { COLORING_COVER_CROP_PRESETS, normalizeImageFile } from '@/utils/image/imagePolicy';
import { useSessionDraft } from '@/hooks/useSessionDraft';
import { useAuth } from '@/hooks/useAuth';
import { useRecoverableDraft } from '@/hooks/drafts/useRecoverableDraft';
import { useDirtyFormGuard } from '@/hooks/useDirtyFormGuard';
import {
  coloringBookDraftValues,
  isColoringBookDraftValues,
  restoreColoringBookDraft,
} from '@/hooks/drafts/formDraftAdapters';
import {
  DraftPhotoReminder,
  DraftRecoveryPanel,
  DraftStorageError,
} from '@/components/drafts/DraftRecoveryPanel';
import { ColoringBookAcquisitionFields } from './ColoringBookAcquisitionFields';
import { ColoringBookBibliographyFields } from './ColoringBookBibliographyFields';
import { ColoringBookCoverPanel } from './ColoringBookCoverPanel';
import { ColoringBookIdentityFields } from './ColoringBookIdentityFields';
import { ColoringBookNotesFields } from './ColoringBookNotesFields';
import { ColoringBookSourceFields } from './ColoringBookSourceFields';
import { ColoringBookStatusFields } from './ColoringBookStatusFields';
import { ColoringBookTagManager } from './ColoringBookTagManager';

interface ColoringBookFormProps {
  sessionDraftKey?: string;
  accountId?: string;
  initialBook?: ColoringBookDTO;
  coverUrl?: string;
  formId?: string;
  saveButtonId?: string;
  layout?: 'page' | 'drawer';
  showFooter?: boolean;
  publishers: BookPublisherListItem[];
  illustrators: BookIllustratorListItem[];
  isSubmitting?: boolean;
  submitLabel: string;
  submittingLabel?: string;
  onCancel: () => void;
  onSubmit: (
    values: ColoringBookSubmitValues,
    onConfirmedSave: () => void,
    expectedRevision?: number,
    changedTagIds?: string[]
  ) => Promise<boolean>;
  expectedRevisionOverride?: number;
  onSessionDraftConflict?: (conflict: boolean) => void;
  onDraftBlockChange?: (blocked: boolean) => void;
  draftRetireRef?: RefObject<(() => void) | null>;
  dismissRef?: RefObject<(() => boolean) | null>;
  onCreatePublisher: (name: string) => Promise<{ id: string; name: string }>;
  onCreateIllustrator: (name: string) => Promise<{ id: string; name: string }>;
}

type ColoringSessionDraft = {
  values: ColoringBookFormValues;
  statusBeforeDateChange: ColoringBookFormValues['status'] | null;
  missingPhoto: boolean;
  cropFile: File | null;
  cropOpen: boolean;
  baselineRevision?: number;
};

const EMPTY_VALUES: ColoringBookFormValues = {
  title: '',
  totalPages: 1,
  status: ColoringBooksStatusOptions.purchased,
  series: '',
  theme: '',
  isbn: '',
  publicationYear: '',
  edition: '',
  language: '',
  sourceUrl: '',
  datePurchased: '',
  dateReceived: '',
  dateStarted: '',
  dateCompleted: '',
  bookFormat: '',
  notes: '',
  isMystery: false,
  publisher: '',
  illustrator: '',
  tags: [],
  coverImage: null,
  coverImageRemoved: false,
};

const toInitialValues = (book?: ColoringBookDTO): ColoringBookFormValues => {
  if (!book) return EMPTY_VALUES;
  return {
    title: book.title,
    totalPages: book.totalPages,
    status: book.status,
    series: book.series,
    theme: book.theme,
    isbn: book.isbn,
    publicationYear: book.publicationYear ?? '',
    edition: book.edition,
    language: book.language as ColoringBookFormValues['language'],
    sourceUrl: book.sourceUrl,
    datePurchased: book.datePurchased,
    dateReceived: book.dateReceived,
    dateStarted: book.dateStarted,
    dateCompleted: book.dateCompleted,
    bookFormat: book.bookFormat as ColoringBookFormValues['bookFormat'],
    notes: book.notes,
    isMystery: book.isMystery,
    publisher: book.publisherId,
    illustrator: book.illustratorId,
    tags: book.tags ?? [],
    coverImage: null,
    coverImageRemoved: false,
  };
};

export function ColoringBookForm({
  sessionDraftKey,
  accountId,
  initialBook,
  coverUrl,
  formId,
  saveButtonId,
  layout = 'page',
  showFooter = true,
  publishers,
  illustrators,
  isSubmitting = false,
  submitLabel,
  submittingLabel,
  onCancel,
  onSubmit,
  expectedRevisionOverride,
  onSessionDraftConflict,
  onDraftBlockChange,
  draftRetireRef,
  dismissRef,
  onCreatePublisher,
  onCreateIllustrator,
}: ColoringBookFormProps) {
  const [initialValues] = useState(() => toInitialValues(initialBook));
  const restored = useSessionDraft<ColoringSessionDraft>(
    sessionDraftKey,
    accountId,
    (): ColoringSessionDraft | undefined =>
      values !== initialValues || cropFile
        ? {
            values,
            statusBeforeDateChange,
            missingPhoto,
            cropFile,
            cropOpen: isCropDialogOpen,
            baselineRevision:
              expectedRevisionOverride ?? restoredBaselineRevision ?? initialBookRevision,
          }
        : undefined,
    draft => {
      restoredSessionDraft.current = draft;
      setValues(draft.values);
      setCropFile(draft.cropFile);
      setIsCropDialogOpen(draft.cropOpen);
      setStatusBeforeDateChange(draft.statusBeforeDateChange ?? null);
      setMissingPhoto(draft.missingPhoto ?? false);
    }
  );
  const restoredSessionDraft = useRef(restored);
  const [values, setValues] = useState<ColoringBookFormValues>(
    () => restoredSessionDraft.current?.values ?? initialValues
  );
  const [cropFile, setCropFile] = useState<File | null>(
    restoredSessionDraft.current?.cropFile ?? null
  );
  const [isCropDialogOpen, setIsCropDialogOpen] = useState(
    restoredSessionDraft.current?.cropOpen ?? false
  );
  const [restoredCoverImage] = useState(values.coverImage);
  const [initialBookUpdatedAt] = useState(initialBook?.updatedAt);
  const [initialBookRevision] = useState(initialBook?.revision ?? 0);
  const restoredBaselineRevision = restoredSessionDraft.current?.baselineRevision;
  useEffect(() => {
    onSessionDraftConflict?.(
      typeof restoredBaselineRevision === 'number' &&
        restoredBaselineRevision !== initialBookRevision
    );
  }, [initialBookRevision, onSessionDraftConflict, restoredBaselineRevision]);
  const [missingPhoto, setMissingPhoto] = useState(
    restoredSessionDraft.current?.missingPhoto ?? false
  );
  const {
    statusBeforeDateChange,
    setStatusBeforeDateChange,
    statusForStatusChange,
    statusForDateChange,
  } = useCompletionDateStatus<ColoringBookFormValues['status']>(
    'completed',
    restoredSessionDraft.current?.statusBeforeDateChange
  );
  const { user } = useAuth();
  const [ownerAccountId, setOwnerAccountId] = useState<string | null>(user?.id ?? null);
  useEffect(() => {
    if (!ownerAccountId && user?.id) setOwnerAccountId(user.id);
  }, [ownerAccountId, user?.id]);
  const draft = useRecoverableDraft({
    kind: initialBook ? 'coloring-book-edit' : 'coloring-book-new',
    ownerAccountId,
    recordId: initialBook?.id,
    baseline: coloringBookDraftValues(initialValues),
    values: coloringBookDraftValues(
      values,
      missingPhoto || (isCropDialogOpen && Boolean(cropFile)),
      statusBeforeDateChange
    ),
    baselineUpdatedAt: initialBookUpdatedAt,
    validate: isColoringBookDraftValues,
    onRestore: saved => {
      setValues(restoreColoringBookDraft(saved, user?.id ?? ''));
      setStatusBeforeDateChange(saved.statusBeforeDateChange ?? null);
      setMissingPhoto(saved.hadNewPhoto);
      setPreviewUrl(saved.fields.coverImageRemoved ? '' : (coverUrl ?? ''));
    },
  });
  const [isSubmitLocked, setIsSubmitLocked] = useState(false);
  const submitLockRef = useRef(false);
  const isSaving = isSubmitting || isSubmitLocked;
  const { allowLeave, confirmDiscard, markChanged } = useDirtyFormGuard({
    isDirty: draft.dirty,
    isSaving,
    onDiscard: draft.discardOnConfirmedLeave,
  });
  const retireDraft = draft.saved;
  useEffect(() => {
    if (!draftRetireRef) return;
    const retire = () => {
      retireDraft();
      allowLeave();
    };
    draftRetireRef.current = retire;
    return () => {
      if (draftRetireRef.current === retire) draftRetireRef.current = null;
    };
  }, [draftRetireRef, retireDraft, allowLeave]);
  useEffect(() => {
    if (!dismissRef) return;
    const dismiss = () => confirmDiscard(onCancel);
    dismissRef.current = dismiss;
    return () => {
      if (dismissRef.current === dismiss) dismissRef.current = null;
    };
  }, [dismissRef, confirmDiscard, onCancel]);
  const photoChoicePending = missingPhoto && !values.coverImage && !values.coverImageRemoved;
  const draftBlocked = draft.pending || photoChoicePending;
  useEffect(() => onDraftBlockChange?.(draftBlocked), [onDraftBlockChange, draftBlocked]);
  const [fieldErrors, setFieldErrors] = useState<ColoringBookFormFieldErrors>({});
  const [previewUrl, setPreviewUrl] = useState(coverUrl ?? '');

  useEffect(() => {
    if (!restoredCoverImage) return;
    const url = URL.createObjectURL(restoredCoverImage);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [restoredCoverImage]);

  useEffect(() => {
    return () => {
      if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const setField = <K extends keyof ColoringBookFormValues>(
    field: K,
    value: ColoringBookFormValues[K]
  ) => {
    markChanged();
    let status = values.status;
    if (field === 'status') {
      status = statusForStatusChange(
        value as ColoringBookFormValues['status'],
        values.dateCompleted,
        initialBook?.dateCompleted
      );
    }
    if (field === 'dateCompleted') {
      status = statusForDateChange(
        String(value ?? ''),
        values.dateCompleted,
        values.status,
        initialBook?.dateCompleted
      );
    }
    setValues(current => ({
      ...current,
      [field]: value,
      status,
    }));
    setFieldErrors(current => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const applyCoverImage = (file: File | null) => {
    if (file) setMissingPhoto(false);
    setField('coverImage', file);
    setField('coverImageRemoved', false);
    if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(file ? URL.createObjectURL(file) : (coverUrl ?? ''));
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;

    const normalizedFile = normalizeImageFile(file);
    setCropFile(normalizedFile);
    setIsCropDialogOpen(true);
  };

  const handleRemoveImage = () => {
    setMissingPhoto(false);
    setCropFile(null);
    setIsCropDialogOpen(false);
    setField('coverImage', null);
    setField('coverImageRemoved', true);
    if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await submitValues();
  };

  const submitValues = async () => {
    if (isSaving || submitLockRef.current || draftBlocked) return false;

    const validation = validateColoringBookForm(values, {
      existingTotalPages: initialBook?.totalPages,
    });
    setFieldErrors(validation.fieldErrors);
    if (!validation.isValid || !validation.values) return false;

    submitLockRef.current = true;
    setIsSubmitLocked(true);
    try {
      const onConfirmedSave = () => {
        draft.saved();
        allowLeave();
      };
      const selectedTagIds = (validation.values.tags ?? []).map(tag => tag.id);
      const openingTagIds = (initialValues.tags ?? []).map(tag => tag.id);
      const changedTagIds =
        selectedTagIds.length !== openingTagIds.length ||
        selectedTagIds.some(tagId => !openingTagIds.includes(tagId))
          ? selectedTagIds
          : undefined;
      if (!initialBook) return await onSubmit(validation.values, onConfirmedSave);
      const expectedRevision =
        expectedRevisionOverride ?? restoredBaselineRevision ?? initialBookRevision;
      return changedTagIds === undefined
        ? await onSubmit(validation.values, onConfirmedSave, expectedRevision)
        : await onSubmit(validation.values, onConfirmedSave, expectedRevision, changedTagIds);
    } finally {
      submitLockRef.current = false;
      setIsSubmitLocked(false);
    }
  };
  const handleCancel = () => {
    confirmDiscard(onCancel);
  };

  const sharedProps = { values, fieldErrors, isSubmitting: isSaving, setField };
  const isDrawerLayout = layout === 'drawer';
  const statusAndTags = (
    <>
      <ColoringBookStatusFields {...sharedProps} />
      <ColoringBookTagManager
        selectedTags={(values.tags ?? []) as Tag[]}
        disabled={isSaving}
        onTagsChange={tags => setField('tags', tags as ColoringBookFormValues['tags'])}
      />
    </>
  );

  if (ownerAccountId && ownerAccountId !== user?.id) {
    return <p className="text-muted-foreground text-sm">Loading your form…</p>;
  }

  return (
    <form
      id={formId}
      onSubmit={handleSubmit}
      onReset={event => {
        event.preventDefault();
        handleCancel();
      }}
    >
      {draft.recoverable && (
        <DraftRecoveryPanel
          changedOnServer={draft.recoverable.baselineUpdatedAt !== initialBook?.updatedAt}
          onRestore={draft.restore}
          onDiscard={draft.discard}
        />
      )}
      {draft.storageFailed && <DraftStorageError />}
      {photoChoicePending && <DraftPhotoReminder onContinue={() => setMissingPhoto(false)} />}
      <div
        {...(draft.pending ? { inert: true } : {})}
        data-testid="coloring-book-form-layout"
        className={cn(
          'grid grid-cols-1 pb-6',
          isDrawerLayout ? 'gap-8' : 'gap-x-12 lg:grid-cols-[minmax(0,1fr)_320px]'
        )}
      >
        <div
          className={cn('min-w-0 self-start', !isDrawerLayout && 'lg:col-start-1 lg:row-start-1')}
        >
          <ColoringBookIdentityFields {...sharedProps} />
        </div>

        {isDrawerLayout ? (
          <div
            data-testid="coloring-book-drawer-status-tags"
            className="grid gap-8 md:grid-cols-2 md:items-start"
          >
            {statusAndTags}
          </div>
        ) : null}

        <main
          className={cn(
            'min-w-0',
            isDrawerLayout ? 'order-none' : 'order-3 lg:order-none lg:col-start-1 lg:row-start-2'
          )}
        >
          <ColoringBookBibliographyFields
            {...sharedProps}
            maxTotalPages={Math.max(COLORING_BOOK_MAX_PAGES, initialBook?.totalPages ?? 0)}
            publishers={publishers.map(publisher => ({ id: publisher.id, name: publisher.name }))}
            illustrators={illustrators.map(illustrator => ({
              id: illustrator.id,
              name: illustrator.name,
            }))}
            onCreatePublisher={onCreatePublisher}
            onCreateIllustrator={onCreateIllustrator}
          />
          <ColoringBookAcquisitionFields {...sharedProps} />
          <ColoringBookSourceFields {...sharedProps} />
          <ColoringBookNotesFields {...sharedProps} />
        </main>

        <aside
          className={cn(
            isDrawerLayout
              ? 'order-none'
              : 'order-2 lg:order-none lg:col-start-2 lg:row-span-2 lg:row-start-1'
          )}
        >
          <ColoringBookCoverPanel
            previewUrl={previewUrl}
            isSubmitting={isSaving}
            onFileChange={handleFileChange}
            onRemoveImage={handleRemoveImage}
          />
          {isDrawerLayout ? null : statusAndTags}
        </aside>
      </div>

      {showFooter ? (
        <ProjectFormFooter
          saveButtonId={saveButtonId}
          submitting={isSaving}
          disabled={draftBlocked}
          onCancel={handleCancel}
          onSubmit={() => void submitValues()}
          submitLabel={submitLabel}
          submittingLabel={submittingLabel ?? submitLabel}
        />
      ) : null}

      <ImageCropDialog
        open={isCropDialogOpen}
        file={cropFile}
        title="Frame coloring book cover"
        description="Choose a book cover crop, square crop, or fit the whole cover."
        aspect={3 / 4}
        outputWidth={900}
        outputHeight={1200}
        presets={COLORING_COVER_CROP_PRESETS}
        defaultPresetId="cover-3-4"
        onOpenChange={setIsCropDialogOpen}
        onCropComplete={file => {
          setCropFile(file);
          applyCoverImage(file);
        }}
        onUseOriginal={file => {
          setCropFile(file);
          applyCoverImage(file);
        }}
      />
    </form>
  );
}
