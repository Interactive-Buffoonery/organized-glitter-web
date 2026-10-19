import { useEffect, useReducer, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GlassPanel } from '@/components/ui/glass-panel';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/hooks/useAuth';
import { useAppReady } from '@/hooks/useAppReady';
import { useNoIndexPage } from '@/hooks/usePageMetadata';
import { listAccountSignInMethods, type AccountSignInMethod } from '@/services/auth/providers';
import {
  requestDeletionOAuthProof,
  requestDeletionPasswordProof,
} from '@/services/auth/accountDeletion';
import { captureSessionIdentity, isCurrentSessionIdentity } from '@/services/auth/sessionIdentity';
import type { OAuthProvider } from '@/services/auth/types';
import { AccountDeletionService } from '@/services/pocketbase/accountDeletion.service';
import { finishDeletionCleanup } from '@/services/accountDeletion/cleanup';
import { useDeletionRecovery } from '@/services/accountDeletion/recovery';
import { deletionIntents } from '@/services/accountDeletion/intentStore';
import {
  AccountDeletionError,
  type DeletionIntent,
  type FreshDeletionProof,
} from '@/services/accountDeletion/types';

type Phase =
  'verify' | 'verifying' | 'ready' | 'sending' | 'uncertain' | 'deleted' | 'cleaning' | 'complete';
type State = { phase: Phase; proof?: FreshDeletionProof; intent?: DeletionIntent; error?: string };
type Action =
  | { type: 'restore'; intent: DeletionIntent }
  | { type: 'verify' }
  | { type: 'verified'; proof: FreshDeletionProof }
  | { type: 'verification_failed'; error: string }
  | { type: 'send' }
  | { type: 'uncertain'; intent?: DeletionIntent; error?: string }
  | { type: 'deleted'; intent: DeletionIntent }
  | { type: 'clean' }
  | { type: 'cleanup_failed' }
  | { type: 'complete'; intent: DeletionIntent };

function restored(intent?: DeletionIntent): State {
  if (!intent) return { phase: 'verify' };
  return {
    intent,
    phase:
      intent.phase === 'pending' ? 'uncertain' : intent.localCleanupDone ? 'complete' : 'deleted',
  };
}
function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'restore':
      return ['sending', 'cleaning'].includes(state.phase) ? state : restored(action.intent);
    case 'verify':
      return state.phase === 'verify' || state.phase === 'ready' ? { phase: 'verifying' } : state;
    case 'verified':
      return state.phase === 'verifying' ? { phase: 'ready', proof: action.proof } : state;
    case 'verification_failed':
      return { phase: 'verify', error: action.error };
    case 'send':
      return { ...state, phase: 'sending', error: undefined };
    case 'uncertain': {
      const intent = action.intent ?? state.intent;
      if (intent?.phase === 'deleted')
        return {
          phase: intent.localCleanupDone ? 'complete' : 'deleted',
          intent,
          error: 'Account deleted. Additional cleanup status is unavailable. Check again later.',
        };
      return { phase: 'uncertain', intent, error: action.error };
    }
    case 'deleted':
      return { phase: 'deleted', intent: action.intent };
    case 'clean':
      return { ...state, phase: 'cleaning', error: undefined };
    case 'cleanup_failed':
      return {
        ...state,
        phase: 'deleted',
        error: new AccountDeletionError('local_cleanup').message,
      };
    case 'complete':
      return { phase: 'complete', intent: action.intent };
  }
}

function DeletionFlow({
  accountId,
  initialIntent,
  storageError,
}: {
  accountId?: string;
  initialIntent?: DeletionIntent;
  storageError: boolean;
}) {
  const [state, dispatch] = useReducer(reducer, initialIntent, restored);
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [methods, setMethods] = useState<AccountSignInMethod[]>([]);
  useEffect(() => {
    if (initialIntent) dispatch({ type: 'restore', intent: initialIntent });
  }, [initialIntent]);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!accountId || initialIntent) return;
    let active = true;
    const identity = captureSessionIdentity();
    void listAccountSignInMethods(accountId)
      .then(result => {
        if (active && isCurrentSessionIdentity(identity))
          setMethods(result.filter(method => method.configured && method.linked));
      })
      .catch(() => {
        /* Password verification remains available when provider discovery fails. */
      });
    return () => {
      active = false;
    };
  }, [accountId, initialIntent]);

  const verify = async (provider?: OAuthProvider) => {
    if (!accountId || inFlight.current) return;
    inFlight.current = true;
    const identity = captureSessionIdentity();
    dispatch({ type: 'verify' });
    // Do not await anything before the OAuth helper opens its popup.
    const pending = provider
      ? requestDeletionOAuthProof(provider, accountId)
      : requestDeletionPasswordProof(password, accountId);
    setPassword('');
    try {
      const result = await pending;
      if (!mounted.current) return;
      if (!isCurrentSessionIdentity(identity)) {
        dispatch({
          type: 'verification_failed',
          error: new AccountDeletionError('account_changed').message,
        });
      } else if (result.success) {
        dispatch({ type: 'verified', proof: result.proof });
      } else {
        dispatch({ type: 'verification_failed', error: result.error });
      }
    } catch {
      if (mounted.current)
        dispatch({
          type: 'verification_failed',
          error: 'Could not verify your identity. Please try again.',
        });
    } finally {
      inFlight.current = false;
    }
  };

  const clean = async (intent: DeletionIntent) => {
    dispatch({ type: 'clean' });
    try {
      const updated = await finishDeletionCleanup(intent);
      if (mounted.current) dispatch({ type: 'complete', intent: updated });
    } catch {
      if (mounted.current) dispatch({ type: 'cleanup_failed' });
    }
  };

  const send = async (recoveryIntent = state.intent) => {
    if (inFlight.current || (!recoveryIntent && (!confirmed || !state.proof))) return;
    inFlight.current = true;
    const identity = captureSessionIdentity();
    dispatch({ type: 'send' });
    try {
      const intent = recoveryIntent
        ? await AccountDeletionService.retry(recoveryIntent)
        : await AccountDeletionService.deleteAccount(state.proof!);
      if (!mounted.current || !isCurrentSessionIdentity(identity)) return;
      dispatch({ type: 'deleted', intent });
      if (!intent.localCleanupDone) await clean(intent);
      else dispatch({ type: 'complete', intent });
    } catch (error) {
      if (!mounted.current || !isCurrentSessionIdentity(identity)) return;
      if (
        error instanceof AccountDeletionError &&
        (error.reason === 'storage' ||
          error.reason === 'verification' ||
          error.reason === 'account_changed')
      ) {
        dispatch({ type: 'verification_failed', error: error.message });
      } else {
        dispatch({
          type: 'uncertain',
          intent: recoveryIntent,
          error: new AccountDeletionError('uncertain').message,
        });
      }
    } finally {
      inFlight.current = false;
    }
  };

  // A newly persisted intent can arrive through the cross-tab subscription before
  // the POST resolves. Once pending, expose only receipt recovery.
  const recovery = useDeletionRecovery();
  const durable = recovery.intents.find(
    intent => intent.accountId === (accountId ?? initialIntent?.accountId)
  );
  const visibleIntent = state.intent ?? durable;
  const isPending =
    state.phase === 'uncertain' ||
    (durable && !['sending', 'cleaning', 'deleted', 'complete'].includes(state.phase));
  const isDeleted =
    ['deleted', 'cleaning', 'complete'].includes(state.phase) || visibleIntent?.phase === 'deleted';
  const isBusy = ['verifying', 'sending', 'cleaning'].includes(state.phase);
  const canStart = accountId && !storageError && !visibleIntent && !isPending && !isDeleted;

  return (
    <MainLayout>
      <div className="container mx-auto max-w-2xl space-y-6 px-4 py-8">
        <h1 className="font-display text-3xl">Delete your account</h1>
        <GlassPanel className="space-y-6 p-6">
          {isDeleted ? (
            <>
              <div role="status" aria-live="polite" className="space-y-3">
                <h2 className="text-lg font-semibold">Account deleted</h2>
                <p>
                  {state.phase === 'complete' || visibleIntent?.localCleanupDone
                    ? 'Local account data has been cleared from this browser.'
                    : 'Local cleanup still needs to finish on this device.'}
                </p>
                <p>
                  {visibleIntent?.cleanup === 'completed'
                    ? 'Additional cleanup is complete.'
                    : 'Additional cleanup with service providers is pending. Your account is already deleted.'}
                </p>
              </div>
              {state.error && <p role="alert">{state.error}</p>}
              {visibleIntent && !visibleIntent.localCleanupDone && (
                <Button
                  type="button"
                  onClick={() => {
                    if (!inFlight.current) {
                      inFlight.current = true;
                      void clean(visibleIntent).finally(() => {
                        inFlight.current = false;
                      });
                    }
                  }}
                  disabled={isBusy}
                >
                  Retry local cleanup
                </Button>
              )}
              {visibleIntent?.localCleanupDone && visibleIntent.cleanup === 'pending' && (
                <Button type="button" onClick={() => void send()} disabled={isBusy}>
                  Check deletion status
                </Button>
              )}
              {visibleIntent?.localCleanupDone && visibleIntent.cleanup === 'completed' && (
                <Button
                  type="button"
                  onClick={() => {
                    void deletionIntents
                      .remove(visibleIntent)
                      .catch(() => dispatch({ type: 'cleanup_failed' }));
                  }}
                  disabled={isBusy}
                >
                  Finish
                </Button>
              )}
              {visibleIntent?.localCleanupDone && (
                <p>
                  <Link className="text-primary underline" to="/">
                    Return home
                  </Link>
                </p>
              )}
            </>
          ) : isPending ? (
            <>
              <div role="status" aria-live="polite">
                <p>{new AccountDeletionError('uncertain').message}</p>
                <p className="mt-3">
                  This account is paused while the request is unresolved. You can close this tab and
                  return to check the same request.
                </p>
              </div>
              <Button
                type="button"
                disabled={isBusy || !visibleIntent}
                onClick={() => {
                  if (visibleIntent) {
                    void send(visibleIntent);
                  }
                }}
              >
                Check deletion status
              </Button>
              <p>
                <a className="text-primary underline" href="mailto:support@organizedglitter.app">
                  Contact support
                </a>
              </p>
            </>
          ) : !accountId ? (
            <p>
              <Link className="text-primary underline" to="/login">
                Sign in
              </Link>{' '}
              to begin an account deletion request.
            </p>
          ) : (
            <>
              <div className="space-y-3">
                <h2 className="font-semibold">This cannot be undone</h2>
                <p>
                  Your projects, books, pages, progress images, profile, and preferences will be
                  permanently deleted. Export anything you want to keep before continuing.
                </p>
                <p>
                  Additional cleanup with service providers can take longer. Store and legally
                  required records may be retained.
                </p>
              </div>
              {storageError && (
                <p role="alert">
                  Private browser storage is unavailable. Deletion cannot start on this device.
                </p>
              )}
              {state.error && <p role="alert">{state.error}</p>}
              <div className="space-y-3">
                <Label htmlFor="deletion-password">Current password</Label>
                <Input
                  id="deletion-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  disabled={isBusy || !canStart}
                />
                <Button
                  type="button"
                  onClick={() => void verify()}
                  disabled={!password || isBusy || !canStart}
                >
                  Verify password
                </Button>
              </div>
              {methods.map(method => (
                <Button
                  key={method.provider}
                  type="button"
                  variant="outline"
                  onClick={() => void verify(method.provider)}
                  disabled={isBusy || !canStart}
                >
                  Verify with {method.label}
                </Button>
              ))}
              {state.phase === 'ready' && <p role="status">Identity verified for five minutes.</p>}
              <div className="flex items-start gap-3">
                <Checkbox
                  id="delete-confirmed"
                  checked={confirmed}
                  onCheckedChange={value => setConfirmed(value === true)}
                  disabled={isBusy}
                />
                <Label htmlFor="delete-confirmed">
                  I understand that this permanently deletes my account
                </Label>
              </div>
              <Button
                type="button"
                variant="glass-destructive"
                onClick={() => void send()}
                disabled={state.phase !== 'ready' || !confirmed || isBusy || !canStart}
              >
                Delete my account
              </Button>
              <p>
                <Link className="text-primary underline" to="/profile">
                  Cancel
                </Link>
              </p>
            </>
          )}
        </GlassPanel>
      </div>
    </MainLayout>
  );
}

export default function DeleteAccount() {
  useAppReady();
  useNoIndexPage('Delete account');
  const { user } = useAuth();
  const recovery = useDeletionRecovery();
  if (!recovery.ready) return <div role="status">Checking account recovery…</div>;
  const intent = recovery.intents.find(intent => (user ? intent.accountId === user.id : true));
  return (
    <DeletionFlow
      key={user?.id ?? 'signedout'}
      accountId={user?.id}
      initialIntent={intent}
      storageError={recovery.error}
    />
  );
}
