import { Button } from '@/components/ui/button';

interface ColoringDetailRefreshNoticeProps {
  kind: 'book' | 'page';
  onRetry: () => void;
  retryable: boolean;
  isRetrying?: boolean;
  message?: string;
}

export function ColoringDetailRefreshNotice({
  kind,
  onRetry,
  retryable,
  isRetrying = false,
  message,
}: ColoringDetailRefreshNoticeProps) {
  return (
    <div className="border-border/60 flex flex-col items-center justify-between gap-3 border-y px-4 py-4 text-center sm:flex-row sm:text-left">
      <p className="text-muted-foreground text-sm" role="alert" aria-atomic="true">
        {message ?? `Could not refresh coloring ${kind}. Showing the last loaded details.`}
      </p>
      {retryable && (
        <Button type="button" variant="ghost" onClick={onRetry} disabled={isRetrying}>
          {isRetrying ? 'Trying again' : 'Try again'}
        </Button>
      )}
    </div>
  );
}
