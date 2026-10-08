import { sessionDraftKeys } from '@/services/auth/sessionDraftKeys';
import { ProtectedLazyRoute } from '@/components/routing/ProtectedLazyRoute';
import { useFeedbackDialog } from './FeedbackDialogStore';
import { lazy, useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { hasSessionDraft } from '@/services/auth/sessionRecovery';

const FeedbackDialog = lazy(() => import('./FeedbackDialog'));

/**
 * Provider component that renders the feedback dialog when needed
 * This should be placed near the root of the application
 */
function FeedbackDialogProvider() {
  // Get dialog state from the store
  const isOpen = useFeedbackDialog(state => state.isOpen);
  const options = useFeedbackDialog(state => state.options);
  const closeDialog = useFeedbackDialog(state => state.closeDialog);
  const resetDialog = useFeedbackDialog(state => state.resetDialog);
  const openDialog = useFeedbackDialog(state => state.openDialog);
  const { user, initialCheckComplete } = useAuth();
  const previousUserId = useRef(user?.id ?? null);
  const [openedAccountId, setOpenedAccountId] = useState<string | null>(null);
  const canOpen = isOpen && Boolean(user) && previousUserId.current === user?.id;

  useEffect(() => {
    if (canOpen && user) setOpenedAccountId(user.id);
  }, [canOpen, user]);

  useEffect(() => {
    if (!initialCheckComplete) return;
    const accountId = user?.id ?? null;
    if (previousUserId.current !== accountId) {
      previousUserId.current = accountId;
      setOpenedAccountId(null);
      resetDialog();
      if (accountId && hasSessionDraft(sessionDraftKeys.feedback, accountId)) {
        openDialog({});
      }
      return;
    }
    if (!user && isOpen) closeDialog();
    if (user && !isOpen && hasSessionDraft(sessionDraftKeys.feedback, user.id)) {
      openDialog(options);
    }
  }, [user, initialCheckComplete, isOpen, closeDialog, openDialog, options, resetDialog]);

  // Handle dialog open/close
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        closeDialog();
      }
    },
    [closeDialog]
  );

  if (!user || (openedAccountId !== user.id && !canOpen)) return null;

  return (
    <ProtectedLazyRoute suspense="bare" errorBoundary="Feedback">
      <FeedbackDialog
        key={user?.id ?? 'signed-out'}
        isOpen={canOpen}
        accountId={user?.id}
        onOpenChange={handleOpenChange}
        title={options.title}
        subtitle={options.subtitle}
        eventId={options.eventId}
        name={options.name}
        email={options.email}
        submitButtonText={options.submitButtonText}
        successMessage={options.successMessage}
        currentPage={options.currentPage}
      />
    </ProtectedLazyRoute>
  );
}

export default FeedbackDialogProvider;
