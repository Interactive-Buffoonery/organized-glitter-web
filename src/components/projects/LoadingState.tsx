import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

interface LoadingStateProps {
  message?: string;
}

const LoadingState: React.FC<LoadingStateProps> = ({ message = 'Loading...' }) => {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setIsSlow(true), 5000);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-4 text-center">
        <p role="status" aria-label="Loading page content" className="text-foreground text-lg">
          {message}
        </p>
        {isSlow && (
          <div className="mx-auto mt-4 max-w-sm">
            <p role="status" aria-label="Slow page loading" className="text-muted-foreground mb-4">
              This is taking a little longer. You can wait or reload to try again.
            </p>
            <Button type="button" variant="glass" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        )}
      </div>
      <div className="animate-pulse space-y-6 motion-reduce:animate-none" aria-hidden="true">
        <div className="bg-muted h-8 w-1/4 rounded"></div>
        <div className="bg-muted h-64 rounded"></div>
        <div className="space-y-3">
          <div className="bg-muted h-6 w-1/2 rounded"></div>
          <div className="bg-muted h-4 w-3/4 rounded"></div>
          <div className="bg-muted h-4 w-1/3 rounded"></div>
        </div>
      </div>
    </div>
  );
};

export default LoadingState;
