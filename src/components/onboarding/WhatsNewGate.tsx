import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { showUserReportDialog } from '@/components/FeedbackDialogStore';
import { getContactEmail, getSupportMailto } from '@/lib/contactConfig';

// Bump to show the dialog again after the next release; update CHANGES to match.
export const WHATS_NEW_RELEASE = '2026-11';

const CHANGES = [
  {
    title: 'One library for everything',
    body: 'Kits and coloring books share the same cleaner library, with quick status filters.',
  },
  {
    title: 'Photo-first detail pages',
    body: 'Kits, coloring books and coloring pages now lead with your photos and keep a progress journal.',
  },
  {
    title: 'Easier color tracking',
    body: 'Page colors have their own screen. Tap a color to edit it in place while your color strip photo stays pinned at the top.',
  },
  {
    title: 'Crafting streak',
    body: 'Count your crafting days in a row on Home or in Notes. Turn it on in Profile, under Preferences.',
  },
];

const ALLOWED_PATHS = new Set(['/overview', '/dashboard']);
const seenKey = (userId: string) => `organized-glitter:whats-new:${userId}`;

function hasSeen(userId: string) {
  try {
    return localStorage.getItem(seenKey(userId)) === WHATS_NEW_RELEASE;
  } catch {
    return false;
  }
}

function markSeen(userId: string) {
  try {
    localStorage.setItem(seenKey(userId), WHATS_NEW_RELEASE);
  } catch {
    // ponytail: without storage it shows again next visit; acceptable for a release note.
  }
}

/** Shows a one-time release note with support contact options on the home pages. */
export function WhatsNewGate() {
  const { user, isAuthenticated, initialCheckComplete } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const userId = user?.id;

  // ponytail: automated browsers skip the note so seeded e2e sessions are not blocked by it.
  const shouldShow =
    !navigator.webdriver &&
    initialCheckComplete &&
    isAuthenticated &&
    !!userId &&
    user?.coloring_walkthrough_seen === true &&
    ALLOWED_PATHS.has(pathname) &&
    !hasSeen(userId);

  useEffect(() => {
    if (shouldShow) setOpen(true);
  }, [shouldShow]);

  if (!open || !userId) return null;

  const close = () => {
    markSeen(userId);
    setOpen(false);
  };

  const contactEmail = getContactEmail();
  const mailto = getSupportMailto('Organized Glitter help');

  return (
    <Dialog open onOpenChange={isOpen => !isOpen && close()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>What's new</DialogTitle>
          <DialogDescription>Here's what changed in Organized Glitter.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-3 text-sm">
          {CHANGES.map(change => (
            <li key={change.title}>
              <p className="font-medium">{change.title}</p>
              <p className="text-muted-foreground">{change.body}</p>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-sm">
          Questions, or something not working right? Send feedback here
          {contactEmail && mailto ? (
            <>
              {' '}
              or email{' '}
              <a className="text-primary underline underline-offset-2" href={mailto}>
                {contactEmail}
              </a>
            </>
          ) : null}
          .
        </p>
        <DialogFooter>
          <Button
            type="button"
            variant="glass"
            onClick={() => {
              close();
              showUserReportDialog();
            }}
          >
            Send feedback
          </Button>
          <Button type="button" onClick={close}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
