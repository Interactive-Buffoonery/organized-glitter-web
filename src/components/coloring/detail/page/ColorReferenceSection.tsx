import { useEffect, useRef, useState } from 'react';
import { Section, SectionHeading } from '@/components/shared/Section';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useConfirmationDialog } from '@/hooks/useConfirmationDialog';
import {
  useColorReference,
  useColorReferenceImages,
} from '@/hooks/queries/coloring/useColorReference';
import { useSaveColorReference } from '@/hooks/mutations/coloring/useSaveColorReference';
import { notifyError, notifySuccess } from '@/lib/notifications';
import { prepareColorReferenceImage } from '@/utils/image/colorReferenceImage';
import { IMAGE_ACCEPT_ATTRIBUTE } from '@/utils/image/imagePolicy';
import { ColorReferenceViewer } from './ColorReferenceViewer';

const MAX_SWATCH_PHOTOS = 100;
const MAX_UPLOAD_BYTES = 190 * 1024 * 1024;
const PHOTO_LIMIT_MESSAGE =
  'A page can have up to 100 swatch photos. Remove a photo before adding more.';
const UPLOAD_LIMIT_MESSAGE = 'Choose fewer photos for this upload, up to 190 MB at a time.';

export function ColorReferenceSection({ pageId }: { pageId: string }) {
  const { user } = useAuth();
  if (!user) return null;
  return <ColorReferenceEditor key={`${user.id}:${pageId}`} pageId={pageId} userId={user.id} />;
}

function ColorReferenceEditor({ pageId, userId }: { pageId: string; userId: string }) {
  const query = useColorReference(pageId, userId);
  const images = useColorReferenceImages(query.data, userId);
  const save = useSaveColorReference(pageId, userId);
  const { confirmDelete, ConfirmationDialog } = useConfirmationDialog();
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState('');
  const baseline = useRef('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadNeedsRetry, setUploadNeedsRetry] = useState(false);
  const [files, setFiles] = useState<Array<{ file: File; url: string }>>([]);
  const [preparing, setPreparing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const active = useRef(true);
  const busy = useRef(false);
  const filesRef = useRef(files);
  const noteButton = useRef<HTMLDivElement>(null);
  const requestId = useRef('');
  const noteInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) noteInput.current?.focus();
  }, [editing]);
  const libraryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      filesRef.current.forEach(item => URL.revokeObjectURL(item.url));
    };
  }, []);
  const clearFiles = () => {
    filesRef.current.forEach(item => URL.revokeObjectURL(item.url));
    filesRef.current = [];
    setFiles([]);
    setUploadNeedsRetry(false);
    requestId.current = crypto.randomUUID();
  };
  const chooseFiles = async (selected: File[]) => {
    if (busy.current || preparing || uploadNeedsRetry) return;
    if (
      (query.data?.photos.length ?? 0) + filesRef.current.length + selected.length >
      MAX_SWATCH_PHOTOS
    ) {
      notifyError(PHOTO_LIMIT_MESSAGE);
      setSaveError(PHOTO_LIMIT_MESSAGE);
      return;
    }
    setSaveError(null);
    setPreparing(true);
    const prepared: Array<{ file: File; url: string }> = [];
    let prepareFailure: string | null = null;
    let preparedBytes = filesRef.current.reduce((size, item) => size + item.file.size, 0);
    for (const input of selected) {
      try {
        const file = await prepareColorReferenceImage(input);
        if (!active.current) break;
        if (preparedBytes + file.size > MAX_UPLOAD_BYTES) {
          notifyError(UPLOAD_LIMIT_MESSAGE);
          setSaveError(UPLOAD_LIMIT_MESSAGE);
          break;
        }
        preparedBytes += file.size;
        prepared.push({ file, url: URL.createObjectURL(file) });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not read this photo.';
        if (active.current) notifyError(message);
        prepareFailure = message;
      }
    }
    if (!active.current) {
      prepared.forEach(item => URL.revokeObjectURL(item.url));
      return;
    }
    // Only surface a persistent error when the selection left the user with nothing to save.
    if (prepareFailure && prepared.length === 0) setSaveError(prepareFailure);
    requestId.current = crypto.randomUUID();
    filesRef.current = [...filesRef.current, ...prepared];
    setFiles(filesRef.current);
    setPreparing(false);
  };
  const runSave = async (change: Parameters<typeof save.mutateAsync>[0], onSaved: () => void) => {
    if (busy.current || !active.current) return;
    setSaveError(null);
    if (change.action === 'photos' && !uploadNeedsRetry) {
      if (change.files.length + (query.data?.photos.length ?? 0) > MAX_SWATCH_PHOTOS) {
        const message = PHOTO_LIMIT_MESSAGE;
        notifyError(message);
        setSaveError(message);
        return;
      }
      if (change.files.reduce((size, file) => size + file.size, 0) > MAX_UPLOAD_BYTES) {
        const message = UPLOAD_LIMIT_MESSAGE;
        notifyError(message);
        setSaveError(message);
        return;
      }
    }
    busy.current = true;
    try {
      await save.mutateAsync(change);
      if (active.current) {
        onSaved();
        notifySuccess('Color reference saved.');
      }
    } catch (error) {
      if (active.current) {
        const status =
          error && typeof error === 'object' && 'status' in error ? error.status : undefined;
        if (change.action === 'photos') {
          setUploadNeedsRetry(
            previous => previous || typeof status !== 'number' || status === 0 || status >= 500
          );
        }
        const message = error instanceof Error ? error.message : 'Could not save. Try again.';
        notifyError(message);
        setSaveError(message);
      }
    } finally {
      busy.current = false;
    }
  };
  const closeUpload = () => {
    setUploadOpen(false);
    clearFiles();
    setSaveError(null);
    if (uploadNeedsRetry) void query.refetch();
  };
  const finishNotes = () => {
    setEditing(false);
    requestAnimationFrame(() => noteButton.current?.querySelector('button')?.focus());
  };
  const disabled = query.isPending || query.isError || save.isPending;
  return (
    <Section variant="bordered" className="space-y-3" landmark={false}>
      <SectionHeading>Color Codes &amp; Swatches</SectionHeading>
      {saveError && !editing && !uploadOpen && (
        <p role="alert" className="text-destructive-text text-sm">
          {saveError}
        </p>
      )}
      {query.isPending && <p role="status">Loading color reference…</p>}
      {query.isError && (
        <div role="alert">
          Could not load the color reference.{' '}
          <Button type="button" variant="link" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {images.isError && (
        <p role="alert">
          Could not load photos.{' '}
          <Button type="button" variant="link" onClick={() => void images.refetch()}>
            Try again
          </Button>
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {images.data?.map((image, index) => (
          <div key={image.filename} className="min-w-0 space-y-1">
            <ColorReferenceViewer {...image} index={index + 1} />
            <Button
              type="button"
              variant="ghost"
              className="text-destructive-text w-full"
              disabled={disabled}
              aria-label={`Remove swatch photo ${index + 1}`}
              onClick={async () => {
                if (await confirmDelete('Remove this swatch photo?')) {
                  if (active.current)
                    void runSave({ action: 'remove', filename: image.filename }, () => {});
                }
              }}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
      {!query.isPending && !query.isError && !query.data?.notes && !editing && (
        <p className="text-muted-foreground text-sm">
          Keep color codes, blends, and swatch photos for this page here.
        </p>
      )}
      {query.data?.notes && !editing && (
        <p className="text-sm [overflow-wrap:anywhere] whitespace-pre-wrap">{query.data.notes}</p>
      )}
      {editing ? (
        <div className="space-y-2">
          <label htmlFor="color-reference-notes" className="text-sm">
            Color notes
          </label>
          <Textarea
            ref={noteInput}
            id="color-reference-notes"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            value={notes}
            onChange={event => {
              setNotes(event.target.value);
              setSaveError(null);
            }}
            rows={5}
            maxLength={100000}
            disabled={save.isPending}
          />
          {saveError && (
            <p role="alert" className="text-destructive-text text-sm">
              {saveError}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="link"
              disabled={save.isPending}
              onClick={() =>
                void runSave(
                  { action: 'notes', notes, baselineNotes: baseline.current },
                  finishNotes
                )
              }
            >
              Save
            </Button>
            <Button type="button" variant="link" disabled={save.isPending} onClick={finishNotes}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div ref={noteButton}>
          <Button
            type="button"
            variant="link"
            disabled={disabled}
            onClick={() => {
              const value = query.data?.notes ?? '';
              setNotes(value);
              baseline.current = value;
              setEditing(true);
            }}
          >
            {query.data?.notes ? 'Edit note' : 'Add note'}
          </Button>
        </div>
      )}
      <Dialog
        open={uploadOpen}
        onOpenChange={open => {
          if (!busy.current && !preparing) {
            if (open) setUploadOpen(true);
            else closeUpload();
          }
        }}
      >
        <DialogTrigger asChild>
          <Button type="button" variant="glass" disabled={disabled}>
            Add photo
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85dvh] overflow-y-auto [&>button:last-child]:size-11">
          <DialogHeader>
            <DialogTitle>Add swatch photos</DialogTitle>
            <DialogDescription>Choose photos to preview before saving.</DialogDescription>
          </DialogHeader>
          <input
            ref={libraryInput}
            type="file"
            accept={IMAGE_ACCEPT_ATTRIBUTE}
            multiple
            className="hidden"
            aria-label="Choose swatch photos"
            onChange={event => {
              void chooseFiles(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
          <input
            ref={cameraInput}
            type="file"
            accept={IMAGE_ACCEPT_ATTRIBUTE}
            capture="environment"
            className="hidden"
            aria-label="Take a swatch photo"
            onChange={event => {
              void chooseFiles(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="glass"
              disabled={preparing || save.isPending || uploadNeedsRetry}
              onClick={() => libraryInput.current?.click()}
            >
              Choose photos
            </Button>
            <Button
              type="button"
              variant="glass"
              disabled={preparing || save.isPending || uploadNeedsRetry}
              onClick={() => cameraInput.current?.click()}
            >
              Take photo
            </Button>
          </div>
          {preparing && <p role="status">Preparing photos…</p>}
          <div className="grid grid-cols-2 gap-3">
            {files.map((item, index) => (
              <div key={item.url}>
                <img
                  src={item.url}
                  alt={`Selected swatch sheet ${index + 1}`}
                  className="h-40 w-full object-contain"
                />
                <Button
                  type="button"
                  variant="ghost"
                  disabled={save.isPending || preparing || uploadNeedsRetry}
                  aria-label={`Remove selected photo ${index + 1}`}
                  onClick={() => {
                    URL.revokeObjectURL(item.url);
                    requestId.current = crypto.randomUUID();
                    filesRef.current = filesRef.current.filter(value => value !== item);
                    setFiles(filesRef.current);
                  }}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
          {saveError && (
            <p role="alert" className="text-destructive-text text-sm">
              {saveError}
            </p>
          )}
          {uploadNeedsRetry && (
            <p role="status" className="text-sm">
              The upload could not be confirmed. Retry these photos before changing the selection.
            </p>
          )}
          <div className="bg-background sticky bottom-0 flex justify-end gap-2 py-2">
            <Button
              type="button"
              variant="ghost"
              disabled={save.isPending || preparing}
              onClick={closeUpload}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!files.length || save.isPending || preparing}
              onClick={() =>
                void runSave(
                  {
                    action: 'photos',
                    files: files.map(item => item.file),
                    requestId: requestId.current,
                  },
                  () => {
                    clearFiles();
                    setUploadOpen(false);
                  }
                )
              }
            >
              {save.isPending ? 'Saving…' : uploadNeedsRetry ? 'Retry photos' : 'Save photos'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmationDialog />
    </Section>
  );
}
