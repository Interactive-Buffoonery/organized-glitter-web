import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorHandler } from '@/services/pocketbase/base/ErrorHandler';

interface ColoringDetailUnavailableProps {
  kind: 'book' | 'page';
  error: unknown;
  backPath: string;
  backLabel: string;
  onRetry: () => void;
  isRetrying?: boolean;
}

export function ColoringDetailUnavailable({
  kind,
  error,
  backPath,
  backLabel,
  onRetry,
  isRetrying = false,
}: ColoringDetailUnavailableProps) {
  const failure = error ? ErrorHandler.handleError(error) : null;
  const title =
    failure?.type === 'auth'
      ? 'Sign in to view this coloring ' + kind
      : failure?.type === 'permission'
        ? 'You cannot view this coloring ' + kind
        : failure?.type === 'not_found'
          ? `Coloring ${kind} not found`
          : failure
            ? `Could not load coloring ${kind}`
            : `No coloring ${kind} selected`;
  const canRetry = failure?.retryable;

  return (
    <section className="container mx-auto max-w-4xl px-4 py-8">
      <Button asChild variant="ghost" size="sm">
        <Link to={backPath}>
          <ChevronLeft className="mr-2 size-4" aria-hidden="true" />
          {backLabel}
        </Link>
      </Button>
      <div className="mt-8 rounded-lg border p-8 text-center">
        <div role={failure ? 'alert' : undefined} aria-atomic={failure ? 'true' : undefined}>
          <h1 className="text-xl font-semibold">{title}</h1>
          {failure && failure.type !== 'not_found' && (
            <p className="text-muted-foreground mt-3">{failure.message}</p>
          )}
        </div>
        {canRetry && (
          <Button type="button" className="mt-4" onClick={onRetry} disabled={isRetrying}>
            {isRetrying ? 'Trying again' : 'Try again'}
          </Button>
        )}
      </div>
    </section>
  );
}
