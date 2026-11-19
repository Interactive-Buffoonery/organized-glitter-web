import { useState } from 'react';
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
  'Diamond painting kits and coloring books are in one place now, under Library. You can still filter by type, and you can still turn one craft off if you only diamond paint or only color.',
  'The diamond painting kits, coloring books, and coloring pages show your photos first. There are now progress journals for all of them.',
  'Coloring pages have a new Colors section for mystery coloring. Pick the symbols your color strip uses, then save the marker code you used for each one, plus any codes you tried and notes. Your color strip photo stays pinned at the top while you fill in each code.',
  "I'm testing out a crafting streak option. You can turn it on in Profile, under Preferences.",
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
  const [dismissed, setDismissed] = useState(false);
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

  if (!shouldShow || dismissed) return null;

  const close = () => {
    markSeen(userId);
    setDismissed(true);
  };

  const contactEmail = getContactEmail();
  const mailto = getSupportMailto('Organized Glitter help');

  return (
    <Dialog open onOpenChange={isOpen => !isOpen && close()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>What's new</DialogTitle>
          <DialogDescription>
            Hello all! I've made some changes to Organized Glitter:
          </DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-2 pl-5 text-sm">
          {CHANGES.map(change => (
            <li key={change}>{change}</li>
          ))}
        </ul>
        <p className="text-muted-foreground text-sm">
          Questions, or something isn't working right? Please send me feedback
          {contactEmail && mailto ? (
            <>
              {' '}
              or email me at{' '}
              <a className="text-primary underline underline-offset-2" href={mailto}>
                {contactEmail}
              </a>
            </>
          ) : null}
          . Thank you so much!
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
