import { useState, type ReactNode } from 'react';
import { Info, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

const DISMISSAL_KEY = 'hosting-notice-database-move-dismissed';
let dismissedInMemory = false;

export function HostingNotice() {
  const [isDismissed, setIsDismissed] = useState(() => {
    if (dismissedInMemory) return true;
    try {
      return sessionStorage.getItem(DISMISSAL_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const dismiss = () => {
    dismissedInMemory = true;
    setIsDismissed(true);
    try {
      sessionStorage.setItem(DISMISSAL_KEY, 'true');
    } catch {
      // Closing still works when the browser blocks session storage.
    }
    document.getElementById('main-content')?.focus({ preventScroll: true });
  };

  if (isDismissed) return null;

  return (
    <HostingNoticeContent>
      <Button
        type="button"
        variant="ghost"
        size="icon-touch"
        aria-label="Close hosting notice"
        onClick={dismiss}
      >
        <X aria-hidden="true" />
      </Button>
    </HostingNoticeContent>
  );
}

export function HostingNoticeContent({ children }: { children?: ReactNode }) {
  return (
    <section
      data-notice-id="weekend-hosting"
      aria-labelledby="hosting-notice-title"
      className="border-border bg-card text-foreground border-y"
    >
      <div
        data-notice-content
        className="container mx-auto flex items-start gap-3 px-4 py-3 text-sm leading-relaxed"
      >
        <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p id="hosting-notice-title" className="font-semibold">
            Database move today
          </p>
          <p>
            Our database provider is moving our server to a new facility today, so Organized Glitter
            may be down for a few hours. Your account and saved projects are safe. Thanks for your
            patience!
          </p>
        </div>
        {children}
      </div>
    </section>
  );
}
