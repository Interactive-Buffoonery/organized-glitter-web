import { useEffect, useRef } from 'react';
import { useRouteError } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { focusWhenRootInteractive } from '@/utils/focusWhenRootInteractive';
import { createLogger } from '@/utils/logger';

const logger = createLogger('AppRouterError');

export function AppRouterError() {
  const error = useRouteError();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    logger.error('App route failed', error);
    return focusWhenRootInteractive(headingRef.current);
  }, [error]);

  return (
    <main className="container mx-auto px-4 py-8 text-center" role="alert">
      <h1 ref={headingRef} tabIndex={-1} className="mb-4 text-2xl font-semibold">
        Something went wrong
      </h1>
      <p className="text-muted-foreground mb-6">The page could not load.</p>
      <Button type="button" onClick={() => window.location.reload()}>
        Reload page
      </Button>
    </main>
  );
}
