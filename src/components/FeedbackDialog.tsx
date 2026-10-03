import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { safeEnv } from '@/utils/safe-env';
import { logger } from '@/utils/logger';
import { getContactEmail } from '@/lib/contactConfig';
import { sendFeedbackEmail } from '@/lib/feedback-email-service';
import {
  peekCompletedSessionFeedback,
  subscribeToCompletedSessionFeedback,
  takeCompletedSessionFeedback,
} from '@/services/auth/sessionRecovery';
import { sessionDraftKeys } from '@/services/auth/sessionDraftKeys';
import { useSessionDraft } from '@/hooks/useSessionDraft';

interface FeedbackDialogProps {
  isOpen: boolean;
  accountId?: string;
  onOpenChange: (isOpen: boolean) => void;
  title?: string;
  subtitle?: string;
  eventId?: string;
  name?: string;
  email?: string;
  submitButtonText?: string;
  successMessage?: string;
  currentPage?: string;
}

interface FeedbackDialogState {
  draftId: string;
  userName: string;
  userEmail: string;
  message: string;
  isSubmitting: boolean;
  isSubmitted: boolean;
  submitError: string | null;
}

type FeedbackDialogAction =
  | { type: 'opened'; name: string; email: string; draftId: string }
  | { type: 'restored'; state: FeedbackDialogState }
  | { type: 'messageChanged'; message: string; draftId: string }
  | { type: 'userNameChanged'; userName: string; draftId: string }
  | { type: 'userEmailChanged'; userEmail: string; draftId: string }
  | { type: 'submitStarted' }
  | { type: 'submitSucceeded' }
  | { type: 'submitFailed'; error: string };

function renderFeedbackSubmitError(message: string) {
  const contactEmail = getContactEmail();
  if (!contactEmail || !message.includes(contactEmail)) {
    return message;
  }

  const [beforeEmail, afterEmail] = message.split(contactEmail);

  return (
    <>
      {beforeEmail}
      <a
        href={`mailto:${contactEmail}`}
        className="focus-visible:outline-primary rounded-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {contactEmail}
      </a>
      {afterEmail}
    </>
  );
}

const initialFeedbackDialogState: FeedbackDialogState = {
  draftId: '',
  userName: '',
  userEmail: '',
  message: '',
  isSubmitting: false,
  isSubmitted: false,
  submitError: null,
};

function feedbackDialogReducer(
  state: FeedbackDialogState,
  action: FeedbackDialogAction
): FeedbackDialogState {
  switch (action.type) {
    case 'restored':
      return { ...action.state, isSubmitting: false, submitError: null };
    case 'opened':
      return {
        ...initialFeedbackDialogState,
        draftId: action.draftId,
        userName: action.name,
        userEmail: action.email,
      };
    case 'messageChanged':
      return {
        ...state,
        draftId: action.draftId,
        message: action.message,
        submitError: null,
      };
    case 'userNameChanged':
      return { ...state, draftId: action.draftId, userName: action.userName };
    case 'userEmailChanged':
      return { ...state, draftId: action.draftId, userEmail: action.userEmail };
    case 'submitStarted':
      return { ...state, isSubmitting: true, submitError: null };
    case 'submitSucceeded':
      return { ...state, isSubmitting: false, isSubmitted: true };
    case 'submitFailed':
      return { ...state, isSubmitting: false, submitError: action.error };
  }
}

/**
 * A custom feedback dialog that allows users to submit feedback
 */
function FeedbackDialog({
  isOpen,
  accountId,
  onOpenChange,
  title = 'Share Your Feedback',
  subtitle = "We'd like to hear from you! If you'd like a response to your message, please include your email address.",
  eventId,
  name = '',
  email = '',
  submitButtonText = 'Submit Feedback',
  successMessage = 'Thank you for your message!',
  currentPage,
}: FeedbackDialogProps) {
  const [state, dispatch] = useReducer(feedbackDialogReducer, initialFeedbackDialogState);
  const isSubmittingRef = useRef(false);
  const sessionVersionRef = useRef(0);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageLength = state.message.trim().length;
  const isMessageValid = messageLength >= 10 && messageLength <= 5000;
  const restoredFromSession = useRef(false);
  const recoverySnapshot = useRef(state);
  const draftIdPrefix = useRef<string | null>(null);
  const nextDraftId = useRef(0);
  const newDraftId = useCallback(() => {
    draftIdPrefix.current ??= crypto.randomUUID();
    return `${draftIdPrefix.current}-${++nextDraftId.current}`;
  }, []);
  const restoredDraft = useSessionDraft(
    isOpen ? sessionDraftKeys.feedback : undefined,
    accountId,
    () =>
      isOpen && (state.message.trim() || state.userName !== name || state.userEmail !== email)
        ? state
        : undefined
  );
  const restoredDraftRef = useRef(restoredDraft);
  useLayoutEffect(() => {
    if (restoredDraft) restoredDraftRef.current = restoredDraft;
  }, [restoredDraft]);
  useLayoutEffect(() => {
    recoverySnapshot.current = state;
  }, [state]);

  useEffect(() => {
    sessionVersionRef.current += 1;
    isSubmittingRef.current = false;
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = null;

    if (isOpen) {
      const draft = restoredDraftRef.current;
      restoredFromSession.current = Boolean(draft);
      if (draft) {
        recoverySnapshot.current = draft;
        dispatch({ type: 'restored', state: draft });
      } else {
        dispatch({
          type: 'opened',
          name,
          email,
          draftId: newDraftId(),
        });
      }
    } else {
      restoredDraftRef.current = undefined;
    }
  }, [accountId, email, isOpen, name, newDraftId]);

  useEffect(() => {
    if (!isOpen || !accountId) return;
    const handleCompleted = (
      completedForAccount: string,
      feedback: { draftId?: string; message: string; name: string; email: string }
    ) => {
      if (completedForAccount !== accountId || !restoredFromSession.current) return;
      if (recoverySnapshot.current.draftId !== feedback.draftId) return;
      takeCompletedSessionFeedback(accountId);
      restoredFromSession.current = false;
      dispatch({ type: 'submitSucceeded' });
    };
    const unsubscribe = subscribeToCompletedSessionFeedback(handleCompleted);
    const completedFeedback = peekCompletedSessionFeedback(accountId);
    if (completedFeedback) handleCompleted(accountId, completedFeedback);
    return unsubscribe;
  }, [accountId, isOpen]);

  useEffect(
    () => () => {
      sessionVersionRef.current += 1;
      isSubmittingRef.current = false;
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    },
    []
  );

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      sessionVersionRef.current += 1;
      isSubmittingRef.current = false;
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    onOpenChange(open);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmittingRef.current || !isMessageValid) {
      return;
    }

    isSubmittingRef.current = true;
    const sessionVersion = sessionVersionRef.current;
    dispatch({ type: 'submitStarted' });

    try {
      // Send feedback via email
      const result = await sendFeedbackEmail({
        draftId: state.draftId,
        message: state.message.trim(),
        name: state.userName || 'Anonymous User',
        email: state.userEmail,
        eventId,
        currentPage,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to send feedback');
      }

      if (sessionVersion !== sessionVersionRef.current) return;

      if (safeEnv.isDev) {
        safeEnv.log('Feedback submitted successfully via email service');
      }

      // Show success state
      dispatch({ type: 'submitSucceeded' });

      // Success state will be shown in the dialog UI

      // Close dialog after a delay
      closeTimeoutRef.current = setTimeout(() => {
        if (sessionVersion !== sessionVersionRef.current) return;
        closeTimeoutRef.current = null;
        handleOpenChange(false);
      }, 4000);
    } catch (error) {
      if (sessionVersion !== sessionVersionRef.current) return;
      const message =
        error instanceof Error ? error.message : 'Failed to send feedback. Please try again.';
      dispatch({ type: 'submitFailed', error: message });

      logger.error('Failed to submit feedback:', error);
    } finally {
      if (sessionVersion === sessionVersionRef.current) {
        isSubmittingRef.current = false;
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent layout="keyboard-safe" className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader className={state.isSubmitted ? 'sr-only' : undefined}>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{subtitle}</DialogDescription>
          </DialogHeader>
          <div className={state.isSubmitted ? 'py-8 text-center' : 'sr-only'}>
            <p className="text-primary text-lg font-medium" role="status" aria-atomic="true">
              {state.isSubmitted ? successMessage : ''}
            </p>
            {state.isSubmitted && (
              <p className="text-muted-foreground mt-2 text-sm">
                If you left your email address, we'll be in touch.
              </p>
            )}
          </div>

          {!state.isSubmitted && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">
                  Name
                </Label>
                <Input
                  id="name"
                  value={state.userName}
                  onChange={e =>
                    dispatch({
                      type: 'userNameChanged',
                      userName: e.target.value,
                      draftId: newDraftId(),
                    })
                  }
                  placeholder="Your name (optional)"
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="email" className="text-right">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={state.userEmail}
                  onChange={e =>
                    dispatch({
                      type: 'userEmailChanged',
                      userEmail: e.target.value,
                      draftId: newDraftId(),
                    })
                  }
                  placeholder="Your email (optional)"
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="message" className="text-right">
                  Message
                </Label>
                <Textarea
                  id="message"
                  value={state.message}
                  onChange={e =>
                    dispatch({
                      type: 'messageChanged',
                      message: e.target.value,
                      draftId: newDraftId(),
                    })
                  }
                  placeholder="Please share your thoughts, suggestions, or report an issue"
                  className="col-span-3 min-h-[120px]"
                  required
                  aria-describedby="feedback-message-guidance"
                />
              </div>
              <p id="feedback-message-guidance" className="text-muted-foreground text-sm">
                Enter 10 to 5,000 characters.
              </p>
              {state.submitError ? (
                <p className="text-destructive-text text-sm" role="alert">
                  {renderFeedbackSubmitError(state.submitError)}
                </p>
              ) : null}
            </div>
          )}

          {!state.isSubmitted && (
            <DialogFooter>
              <Button
                type="submit"
                variant="glass"
                disabled={state.isSubmitting || !isMessageValid}
              >
                {state.isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                {submitButtonText}
              </Button>
            </DialogFooter>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default FeedbackDialog;
