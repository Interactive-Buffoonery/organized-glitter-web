import { sessionDraftKeys } from '@/services/auth/sessionDraftKeys';
import FeedbackDialog from './FeedbackDialog';
import { useFeedbackDialog } from './FeedbackDialogStore';
import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { hasSessionDraft } from '@/services/auth/sessionRecovery';

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

  useEffect(() => {
    if (!initialCheckComplete) return;
    if (user?.id && previousUserId.current && previousUserId.current !== user.id) {
      previousUserId.current = user.id;
      resetDialog();
      return;
    }
    if (user?.id) previousUserId.current = user.id;
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

  return (
    <FeedbackDialog
      key={user?.id ?? 'signed-out'}
      isOpen={isOpen && Boolean(user) && previousUserId.current === user?.id}
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
  );
}

export default FeedbackDialogProvider;
