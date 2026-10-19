import { useId, useState, type FormEvent } from 'react';
import { Camera } from 'lucide-react';
import { ClientResponseError } from 'pocketbase';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateSymbolRequest } from '@/hooks/mutations/coloring/useColorKeyMutations';
import { useBlobCleanup } from '@/hooks/useBlobCleanup';
import { parseSymbolRequestInput, SYMBOL_REQUEST_LIMITS } from '@/schemas/colorKeySchema';
import { IMAGE_ACCEPT_ATTRIBUTE } from '@/utils/image/imagePolicy';
import { prepareSymbolRequestPhoto } from '@/utils/image/symbolRequestPhoto';
import { createLogger } from '@/utils/logger';
import { ColorKeySheet } from './ColorKeySheet';

const logger = createLogger('SymbolRequestDialog');

const FIELD_ERRORS: Record<string, string> = {
  email: 'Enter a valid email address.',
  photo: 'Choose a JPG, PNG, or WebP photo under 10 MB.',
  book_label: 'Check the book and page.',
  description: 'Check the description.',
};

function sendErrorMessage(error: unknown) {
  if (!(error instanceof ClientResponseError))
    return error instanceof Error ? error.message : 'Could not send your photo. Try again.';
  if (error.status === 429) return "You've sent a few requests. Try again in a little while.";
  if (error.status === 503)
    return "We're getting a lot of requests right now. Try again in a few minutes.";
  const field = Object.keys(error.response?.data ?? {}).find(name => FIELD_ERRORS[name]);
  if (error.status === 400 && field) return FIELD_ERRORS[field];
  return 'Could not send your photo. Try again.';
}

interface SymbolRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  pageId: string;
  bookLabel: string;
  email: string;
  /** Called once the request exists; usePhoto says whether to place `r:<id>` on the page. */
  onSent: (requestId: string, usePhoto: boolean) => void;
}

export function SymbolRequestDialog({ open, onOpenChange, ...props }: SymbolRequestDialogProps) {
  return (
    <ColorKeySheet
      open={open}
      onOpenChange={onOpenChange}
      title="Send us a symbol"
      description="Send a photo of a symbol that is not in the catalog."
    >
      {open ? <RequestForm onCancel={() => onOpenChange(false)} {...props} /> : null}
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
}: Omit<SymbolRequestDialogProps, 'open' | 'onOpenChange'> & { onCancel: () => void }) {
  const id = useId();
  const send = useCreateSymbolRequest(userId);
  const { createBlobUrl, revokeBlobUrl } = useBlobCleanup();
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [bookLabel, setBookLabel] = useState(initialBookLabel);
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [usePhoto, setUsePhoto] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choosePhoto = (file: File | undefined) => {
    if (!file) return;
    if (photo) revokeBlobUrl(photo.url);
    setPhoto({ file, url: createBlobUrl(file) });
    setError(null);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (!photo) return setError('Choose a photo.');
    const input = { page: pageId, book_label: bookLabel, description, email, photo: photo.file };
    setBusy(true);
    try {
      parseSymbolRequestInput(input);
      const created = await send.mutateAsync({
        ...input,
        photo: await prepareSymbolRequestPhoto(photo.file),
      });
      onSent(created.id, usePhoto);
    } catch (sendError) {
      logger.warn('Could not send a symbol request', sendError);
      setError(sendErrorMessage(sendError));
    } finally {
      setBusy(false);
    }
  };

  const field = 'space-y-1.5';
  const hint = 'text-muted-foreground font-normal';

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <p className="text-muted-foreground text-sm">
        Send a photo of the symbol and we'll add it to the catalog.
      </p>

      <div className={field}>
        <p className="text-sm leading-none font-medium">Photo</p>
        <div className="flex items-center gap-3">
          <span className="border-border/70 bg-background/60 flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
            {photo ? (
              <img src={photo.url} alt="Chosen symbol" className="size-full object-contain" />
            ) : (
              <Camera aria-hidden="true" className="text-muted-foreground size-7" />
            )}
          </span>
          <div className="min-w-0 space-y-1">
            <input
              id={`${id}-photo`}
              type="file"
              accept={IMAGE_ACCEPT_ATTRIBUTE}
              aria-label="Photo of the symbol"
              aria-describedby={`${id}-photo-hint`}
              className="peer sr-only"
              disabled={busy}
              onChange={event => {
                choosePhoto(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            <label
              htmlFor={`${id}-photo`}
              className="border-border hover:bg-muted peer-focus-visible:ring-ring/50 inline-flex h-11 cursor-pointer items-center rounded-md border px-4 text-sm font-medium peer-focus-visible:ring-[3px] peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
            >
              {photo ? 'Choose another photo' : 'Choose a photo'}
            </label>
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
          maxLength={SYMBOL_REQUEST_LIMITS.bookLabel}
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
          aria-describedby={`${id}-email-hint`}
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

      {error ? (
        <p role="alert" className="text-destructive-text text-sm">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" className="h-11" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="h-11 min-w-28" disabled={busy}>
          {busy ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </form>
  );
}
