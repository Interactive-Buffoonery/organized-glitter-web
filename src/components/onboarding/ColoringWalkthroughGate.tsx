import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ColoringWalkthroughDialog } from './ColoringWalkthroughDialog';

const ALLOWED_PATHS = new Set(['/overview', '/dashboard']);

/**
 * Auth-aware wrapper that decides whether to show the welcome walkthrough.
 * Renders nothing until auth is ready; opens the dialog once per account on
 * the main authenticated landing pages (gated by
 * `users.coloring_walkthrough_seen`).
 */
export function ColoringWalkthroughGate() {
  const { user, isAuthenticated, initialCheckComplete } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  const shouldShow =
    initialCheckComplete &&
    isAuthenticated &&
    !!user &&
    user.coloring_walkthrough_seen !== true &&
    ALLOWED_PATHS.has(pathname);

  useEffect(() => {
    if (shouldShow) setOpen(true);
  }, [shouldShow]);

  if (!shouldShow && !open) return null;

  return <ColoringWalkthroughDialog open={open} onClose={() => setOpen(false)} />;
}
