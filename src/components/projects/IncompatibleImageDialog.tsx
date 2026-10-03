import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { POCKETBASE_IMAGE_MIME_TYPES } from '@/utils/image/imageUtils';
import { getContactEmail } from '@/lib/contactConfig';

export interface IncompatibleImageDetails {
  fileName: string;
  fileType: string;
  fileSize: number;
  serverMessage: string;
}

interface IncompatibleImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  details: IncompatibleImageDetails | null;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function buildMailto(details: IncompatibleImageDetails): string {
  const subject = 'Image upload rejected: incompatible format';
  const bodyLines = [
    "The app wouldn't let me upload this image. Details below:",
    '',
    `File name: ${details.fileName}`,
    `Reported type: ${details.fileType || '(none)'}`,
    `Size: ${formatBytes(details.fileSize)}`,
    `Server said: ${details.serverMessage}`,
    `URL: ${window.location.href}`,
    '',
    'Anything else to note?:',
  ];
  const body = bodyLines.join('\n');
  const recipient = getContactEmail() || 'support@example.test';
  return `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function IncompatibleImageDialog({
  open,
  onOpenChange,
  details,
}: IncompatibleImageDialogProps) {
  if (!details) return null;

  const acceptedList = POCKETBASE_IMAGE_MIME_TYPES.map(t =>
    t.replace('image/', '').toUpperCase()
  ).join(', ');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Image isn't compatible</DialogTitle>
          <DialogDescription>
            We couldn't save this image because its format wasn't recognised. This usually happens
            with HEIC photos from iCloud or files downloaded from other apps.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 text-sm">
          <div className="bg-muted rounded-md p-3">
            <p className="font-mono text-xs break-all">{details.fileName}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Detected type: {details.fileType || 'unknown'} · {formatBytes(details.fileSize)}
            </p>
          </div>
          <p className="text-muted-foreground">
            Accepted formats: {acceptedList}. Try exporting or re-saving the image in one of these
            formats and upload again.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => {
              window.open(buildMailto(details), '_blank', 'noopener,noreferrer');
            }}
          >
            Email the error
          </Button>
          <Button onClick={() => onOpenChange(false)} variant="glass">
            Pick a different file
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
