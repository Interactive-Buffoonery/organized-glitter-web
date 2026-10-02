import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MainLayout from '@/components/layout/MainLayout';
import { focusWhenRootInteractive } from '@/utils/focusWhenRootInteractive';
import { getSupportMailto } from '@/lib/contactConfig';

const PAGE_LOADING_TIMEOUT_MS = 30_000;

const PAGE_LOADING_SPINNER = (
  <div className="flex min-h-[400px] w-full items-center justify-center" role="status">
    <div className="flex flex-col items-center gap-2">
      <Loader2
        className="text-muted-foreground size-8 animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      />
      <p className="text-muted-foreground text-sm">Loading…</p>
    </div>
  </div>
);

const isStartupErrorVisible = () => {
  const errorEl = document.getElementById('app-error');
  if (
    errorEl?.isConnected &&
    errorEl.getAttribute('aria-hidden') !== 'true' &&
    errorEl.style.display === 'flex'
  ) {
    return true;
  }

  const splash = document.getElementById('app-loading');
  return Boolean(splash?.isConnected && splash.style.display !== 'none');
};

const PageLoadingRecovery = () => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const supportMailto = getSupportMailto("App won't load");

  useEffect(() => focusWhenRootInteractive(headingRef.current), []);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-2xl text-center">
        <h1 ref={headingRef} tabIndex={-1} className="mb-4 text-2xl font-semibold">
          This is taking too long
        </h1>
        <p className="text-muted-foreground mb-6">
          This page did not finish loading. Reload, or go back and try again.
        </p>
        <div className="gap-x-4">
          <Button type="button" onClick={() => window.location.reload()} variant="glass">
            Reload
          </Button>
          <Button type="button" onClick={() => window.history.back()} variant="ghost">
            Go back
          </Button>
        </div>
        {supportMailto ? (
          <p className="text-muted-foreground mt-4 text-sm">
            Still stuck?{' '}
            <a href={supportMailto} className="text-link underline underline-offset-4">
              Email support
            </a>
          </p>
        ) : (
          <p className="text-muted-foreground mt-4 text-sm">
            Still stuck? Contact your administrator for help.
          </p>
        )}
      </div>
    </div>
  );
};

const PageLoadingContent = () => {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setTimedOut(true);
    }, PAGE_LOADING_TIMEOUT_MS);

    return () => window.clearTimeout(timeoutId);
  }, []);

  if (timedOut && isStartupErrorVisible()) {
    return PAGE_LOADING_SPINNER;
  }

  if (timedOut) {
    return <PageLoadingRecovery />;
  }

  return PAGE_LOADING_SPINNER;
};

/**
 * Page loading fallback component for lazy-loaded routes.
 *
 * Use `<PageLoading />` for bare spinner (public pages).
 * Use `<PageLoading withLayout />` as the Suspense fallback for protected
 * lazy routes so the header/footer stay visible while the lazy chunk loads.
 * This fallback must not hide the splash, mark the app ready, or set
 * `data-app-ready`. Hung chunks use this component's own 30s timer for
 * in-app Reload / Go back recovery, including after a login form already
 * marked ready. If `#app-error` is already the visible recovery, this
 * fallback does not stack a second card.
 */
export const PageLoading = ({ withLayout = false }: { withLayout?: boolean }) => {
  const content = <PageLoadingContent />;

  if (withLayout) {
    return <MainLayout>{content}</MainLayout>;
  }

  return content;
};
