import { useId, useState, type FormEvent } from 'react';
import { Camera } from 'lucide-react';
import { ClientResponseError } from 'pocketbase';
import { ImageCropDialog } from '@/components/image/ImageCropDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateSymbolRequest } from '@/hooks/mutations/coloring/useColorKeyMutations';
import { useBlobCleanup } from '@/hooks/useBlobCleanup';
import { SYMBOL_REQUEST_LIMITS, symbolRequestInputSchema } from '@/schemas/colorKeySchema';
import { IMAGE_ACCEPT_ATTRIBUTE } from '@/utils/image/imagePolicy';
import { prepareSymbolRequestPhoto } from '@/utils/image/symbolRequestPhoto';
import { createLogger } from '@/utils/logger';
import { ColorKeySheet } from './ColorKeySheet';

const logger = createLogger('SymbolRequestDialog');

type Field = 'photo' | 'book_label' | 'email' | 'description';
type FormError = { message: string; field?: Field };

const FIELD_ERRORS: Record<Field, string> = {
  email: 'Enter a valid email address.',
  photo: 'Choose a JPG, PNG, or WebP photo under 10 MB.',
  book_label: 'Check the book and page.',
  description: 'Check the description.',
};
const PLACE_FAILED = "We got your photo, but couldn't add it to this page.";

function sendError(error: unknown): FormError {
  if (!(error instanceof ClientResponseError))
    return {
      message: error instanceof Error ? error.message : 'Could not send your photo. Try again.',
    };
  if (error.status === 429)
    return { message: "You've sent a few requests. Try again in a little while." };
  if (error.status === 503)
    return { message: "We're getting a lot of requests right now. Try again in a few minutes." };
  const field = Object.keys(error.response?.data ?? {}).find(
    (name): name is Field => name in FIELD_ERRORS
  );
  if (error.status === 400 && field) return { message: FIELD_ERRORS[field], field };
  return { message: 'Could not send your photo. Try again.' };
}

interface SymbolRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  pageId: string;
  bookLabel: string;
  email: string;
  /**
   * Called once the request exists; usePhoto says whether to place `r:<id>` on the page.
   * Resolves false when placing failed, so the sheet offers to place it again without resending.
   */
  onSent: (requestId: string, usePhoto: boolean) => Promise<boolean>;
  onCloseAutoFocus?: (event: Event) => void;
}

export function SymbolRequestDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
  ...props
}: SymbolRequestDialogProps) {
  // Lives above the form so no dismissal path can unmount it mid-send.
  const [busy, setBusy] = useState(false);
  return (
    <ColorKeySheet
      open={open}
      onOpenChange={onOpenChange}
      dismissible={!busy}
      onCloseAutoFocus={onCloseAutoFocus}
      title="Send us a symbol"
      description="Send a photo of a symbol that is not in the catalog."
    >
      {open ? (
        <RequestForm
          busy={busy}
          setBusy={setBusy}
          onCancel={() => onOpenChange(false)}
          {...props}
        />
      ) : null}
    </ColorKeySheet>
  );
}

function RequestForm({
  userId,
  pageId,
  bookLabel: initialBookLabel,
  email: initialEmail,
  onSent,
  onCancel,
  busy,
  setBusy,
}: Omit<SymbolRequestDialogProps, 'open' | 'onOpenChange' | 'onCloseAutoFocus'> & {
  onCancel: () => void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
}) {
  const id = useId();
  const send = useCreateSymbolRequest(userId);
  const { createBlobUrl, revokeBlobUrl } = useBlobCleanup();
  const [photo, setPhoto] = useState<{ original: File; file: File; url: string } | null>(null);
  const [cropping, setCropping] = useState(false);
  const [bookLabel, setBookLabel] = useState(initialBookLabel);
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [usePhoto, setUsePhoto] = useState(true);
  const [error, setError] = useState<FormError | null>(null);
  // Set once the request exists but placing it failed; Send then only retries placing.
  const [sentId, setSentId] = useState<string | null>(null);

  const showPhoto = (file: File, original = file) => {
    if (photo) revokeBlobUrl(photo.url);
    setPhoto({ original, file, url: createBlobUrl(file) });
    setError(null);
  };
  const fail = (message: string, field?: Field) => setError({ message, field });
  // Sending disables the focused control; bring focus back to the button, under the error.
  const settle = () => {
    setBusy(false);
    requestAnimationFrame(() => document.getElementById(`${id}-submit`)?.focus());
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    let requestId = sentId;
    if (!requestId) {
      if (!photo) return fail('Choose a photo.', 'photo');
      const input = { page: pageId, book_label: bookLabel, description, email, photo: photo.file };
      const parsed = symbolRequestInputSchema.safeParse(input);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return fail(issue?.message ?? 'Check this request.', issue?.path[0] as Field | undefined);
      }
      setBusy(true);
      let prepared: File;
      try {
        prepared = await prepareSymbolRequestPhoto(photo.file);
      } catch (prepError) {
        settle();
        return fail(prepError instanceof Error ? prepError.message : FIELD_ERRORS.photo, 'photo');
      }
      try {
        requestId = (await send.mutateAsync({ ...parsed.data, photo: prepared })).id;
      } catch (requestError) {
        logger.warn('Could not send a symbol request', requestError);
        settle();
        return setError(sendError(requestError));
      }
    }
    setBusy(true);
    const placed = await onSent(requestId, usePhoto).catch((placeError: unknown) => {
      logger.warn('Could not place a symbol request', placeError);
      return false;
    });
    // On success the parent closes the sheet and this form unmounts.
    if (placed) return setBusy(false);
    setSentId(requestId);
    fail(PLACE_FAILED);
    settle();
  };

  const field = 'space-y-1.5';
  const hint = 'text-muted-foreground font-normal';
  const errorId = `${id}-error`;
  const invalid = (name: Field) => (error?.field === name ? true : undefined);
  const describedBy = (name: Field, ...ids: string[]) =>
    [...ids, error?.field === name ? errorId : ''].filter(Boolean).join(' ') || undefined;

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <p className="text-muted-foreground text-sm">
        Send a photo of the symbol and we'll add it to the catalog.
      </p>

      <fieldset disabled={sentId !== null} className="min-w-0 space-y-4">
        <div className={field}>
          <Label id={`${id}-photo-label`} htmlFor={`${id}-photo`}>
            Photo
          </Label>
          <div className="flex items-center gap-3">
            <span className="border-border/70 bg-background/60 flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
              {photo ? (
                <img src={photo.url} alt="Chosen symbol" className="size-full object-contain" />
              ) : (
                <Camera aria-hidden="true" className="text-muted-foreground size-7" />
              )}
            </span>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap gap-2">
                <input
                  id={`${id}-photo`}
                  type="file"
                  accept={IMAGE_ACCEPT_ATTRIBUTE}
                  aria-labelledby={`${id}-photo-label`}
                  aria-required="true"
                  aria-invalid={invalid('photo')}
                  aria-describedby={describedBy('photo', `${id}-photo-hint`)}
                  className="peer sr-only"
                  disabled={busy || sentId !== null}
                  onChange={event => {
                    const file = event.target.files?.[0];
                    if (file) showPhoto(file);
                    event.target.value = '';
                  }}
                />
                <label
                  htmlFor={`${id}-photo`}
                  className="border-border hover:bg-muted peer-focus-visible:ring-ring/50 inline-flex h-11 cursor-pointer items-center rounded-md border px-4 text-sm font-medium peer-focus-visible:ring-[3px] peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                >
                  {photo ? 'Choose another photo' : 'Choose a photo'}
                </label>
                {photo ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    disabled={busy}
                    onClick={() => setCropping(true)}
                  >
                    Crop photo
                  </Button>
                ) : null}
              </div>
              <p id={`${id}-photo-hint`} className="text-muted-foreground text-sm">
                A close, sharp photo of one symbol works best.
              </p>
            </div>
          </div>
        </div>

        <div className={field}>
          <Label htmlFor={`${id}-book`}>Book and page</Label>
          <Input
            id={`${id}-book`}
            className="h-11"
            required
            maxLength={SYMBOL_REQUEST_LIMITS.bookLabel}
            aria-invalid={invalid('book_label')}
            aria-describedby={describedBy('book_label')}
            value={bookLabel}
            onChange={event => setBookLabel(event.target.value)}
          />
        </div>

        <div className={field}>
          <Label htmlFor={`${id}-description`}>
            Description <span className={hint}>optional</span>
          </Label>
          <Input
            id={`${id}-description`}
            className="h-11"
            placeholder="Two w's stacked"
            maxLength={SYMBOL_REQUEST_LIMITS.description}
            aria-invalid={invalid('description')}
            aria-describedby={describedBy('description')}
            value={description}
            onChange={event => setDescription(event.target.value)}
          />
        </div>

        <div className={field}>
          <Label htmlFor={`${id}-email`}>Email</Label>
          <Input
            id={`${id}-email`}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            aria-invalid={invalid('email')}
            aria-describedby={describedBy('email', `${id}-email-hint`)}
            className="h-11"
            value={email}
            onChange={event => setEmail(event.target.value)}
          />
          <p id={`${id}-email-hint`} className="text-muted-foreground text-sm">
            We'll email you when it's added.
          </p>
        </div>

        <div className="flex items-start gap-3">
          <Checkbox
            id={`${id}-use`}
            className="mt-0.5"
            checked={usePhoto}
            onCheckedChange={checked => setUsePhoto(checked === true)}
          />
          <Label htmlFor={`${id}-use`} className="leading-snug font-normal">
            Use my photo as the symbol on this page for now
          </Label>
        </div>
      </fieldset>

      {error ? (
        <p id={errorId} role="alert" className="text-destructive-text text-sm">
          {error.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" className="h-11" disabled={busy} onClick={onCancel}>
          {sentId ? 'Close' : 'Cancel'}
        </Button>
        <Button id={`${id}-submit`} type="submit" className="h-11 min-w-28" disabled={busy}>
          {busy ? 'Sending…' : sentId ? 'Try again' : 'Send'}
        </Button>
      </div>

      <ImageCropDialog
        open={cropping}
        file={photo?.original ?? null}
        title="Crop the symbol"
        description="Frame the one symbol you need."
        aspect={1}
        outputWidth={800}
        outputHeight={800}
        onOpenChange={setCropping}
        onCropComplete={file => photo && showPhoto(file, photo.original)}
        onUseOriginal={file => showPhoto(file)}
      />
    </form>
  );
}
