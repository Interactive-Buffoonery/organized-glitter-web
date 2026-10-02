import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Link2, Unlink } from 'lucide-react';
import { notify } from '@/lib/notifications';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  connectOAuthProvider,
  listAccountSignInMethods,
  requestOAuthSignInMethodProof,
  requestPasswordSignInMethodProof,
  unlinkOAuthProvider,
  type AccountSignInMethod,
  type FreshSignInMethodProof,
  type SignInMethodAction,
  type OAuthProvider,
} from '@/services/auth';
import { createLogger } from '@/utils/logger';

const signInMethodsLogger = createLogger('SignInMethods');

interface SignInMethodsProps {
  userId: string;
}

interface PendingAction {
  action: SignInMethodAction;
  method: AccountSignInMethod;
}

export function SignInMethods({ userId }: SignInMethodsProps) {
  return <SignInMethodsForUser key={userId} userId={userId} />;
}

function SignInMethodsForUser({ userId }: SignInMethodsProps) {
  const [methods, setMethods] = useState<AccountSignInMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyProvider, setBusyProvider] = useState<OAuthProvider>();
  const [error, setError] = useState<string>();
  const [pendingAction, setPendingAction] = useState<PendingAction>();
  const [password, setPassword] = useState('');
  const [proof, setProof] = useState<FreshSignInMethodProof>();
  const [dialogError, setDialogError] = useState<string>();
  const [verifying, setVerifying] = useState(false);

  const connectedVerificationMethods = useMemo(
    () => methods.filter(method => method.linked && method.configured),
    [methods]
  );

  const loadMethods = async () => {
    try {
      const nextMethods = await listAccountSignInMethods(userId);
      setMethods(nextMethods);
      setError(undefined);
    } catch (loadError) {
      signInMethodsLogger.error('Failed to load sign-in methods', loadError);
      setError('Sign-in methods could not be loaded. Please refresh and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void listAccountSignInMethods(userId)
      .then(nextMethods => {
        if (active) setMethods(nextMethods);
      })
      .catch(loadError => {
        signInMethodsLogger.error('Failed to load sign-in methods', loadError);
        if (active) setError('Sign-in methods could not be loaded. Please refresh and try again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  const openVerification = (action: SignInMethodAction, method: AccountSignInMethod) => {
    setPassword('');
    setProof(undefined);
    setDialogError(undefined);
    setPendingAction({ action, method });
  };

  const verifyWithPassword = async () => {
    if (!pendingAction || !password) return;
    setVerifying(true);
    setDialogError(undefined);
    const result = await requestPasswordSignInMethodProof(
      password,
      pendingAction.action,
      pendingAction.method.provider,
      userId
    );
    setVerifying(false);
    if (!result.success || !result.proof) {
      setDialogError(result.error);
      return;
    }
    setPassword('');
    setProof(result.proof);
  };

  const verifyWithProvider = async (provider: OAuthProvider) => {
    if (!pendingAction) return;
    setVerifying(true);
    setDialogError(undefined);
    const result = await requestOAuthSignInMethodProof(
      provider,
      pendingAction.action,
      pendingAction.method.provider,
      userId
    );
    setVerifying(false);
    if (!result.success || !result.proof) {
      setDialogError(result.error);
      return;
    }
    setProof(result.proof);
  };

  const completeAction = async () => {
    if (!pendingAction || !proof) return;
    const { action, method } = pendingAction;
    const currentProof = proof;
    setProof(undefined);
    setBusyProvider(method.provider);
    setDialogError(undefined);

    const result =
      action === 'link'
        ? await connectOAuthProvider(method.provider, userId, currentProof)
        : await unlinkOAuthProvider(method.provider, currentProof);
    if (!result.success) {
      setDialogError(result.error);
      setBusyProvider(undefined);
      if (result.reason === 'continuity_changed') await loadMethods();
      return;
    }

    setPendingAction(undefined);
    setPassword('');
    await loadMethods();
    setBusyProvider(undefined);
    notify({
      kind: 'success',
      title: `${method.label} ${action === 'link' ? 'connected' : 'unlinked'}`,
      description:
        action === 'link'
          ? `You can now sign in with ${method.label}.`
          : `${method.label} can no longer be used to sign in.`,
    });
  };

  const busyStatus = busyProvider
    ? `${pendingAction?.action === 'unlink' ? 'Unlinking' : 'Connecting'} ${pendingAction?.method.label || 'sign-in method'}…`
    : verifying
      ? 'Verifying your identity…'
      : '';

  if (loading) {
    return (
      <p className="text-muted-foreground text-sm" role="status" aria-live="polite">
        Loading sign-in methods…
      </p>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <p className="sr-only" role="status" aria-live="polite">
          {busyStatus}
        </p>

        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}

        {methods.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No social sign-in methods are configured. You can still sign in with email and password.
          </p>
        ) : (
          <ul className="divide-border/60 divide-y">
            {methods.map(method => {
              const busy = busyProvider === method.provider;
              return (
                <li
                  key={method.provider}
                  className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <p className="text-foreground font-medium">{method.label}</p>
                    {method.linked ? (
                      <p className="text-foreground flex items-center gap-1.5 text-sm">
                        <CheckCircle2
                          className="size-4 text-emerald-700 dark:text-emerald-300"
                          aria-hidden="true"
                        />
                        {method.configured ? 'Connected' : 'Connected, but currently unavailable'}
                      </p>
                    ) : (
                      <p className="text-muted-foreground text-sm">Available to connect</p>
                    )}
                  </div>

                  {method.linked ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Unlink ${method.label}`}
                      disabled={Boolean(busyProvider) || verifying}
                      onClick={() => openVerification('unlink', method)}
                      className="self-start sm:self-auto pointer-coarse:min-h-11"
                    >
                      <Unlink className="size-4" aria-hidden="true" />
                      {busy ? 'Unlinking…' : 'Unlink'}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="glass"
                      size="sm"
                      aria-label={`Connect ${method.label}`}
                      disabled={!method.configured || Boolean(busyProvider) || verifying}
                      onClick={() => openVerification('link', method)}
                      className="self-start sm:self-auto pointer-coarse:min-h-11"
                    >
                      <Link2 className="size-4" aria-hidden="true" />
                      {busy ? 'Connecting…' : 'Connect'}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog
        open={Boolean(pendingAction)}
        onOpenChange={open => {
          if (!open && !busyProvider && !verifying) {
            setPendingAction(undefined);
            setProof(undefined);
            setPassword('');
            setDialogError(undefined);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Verify before {pendingAction?.action === 'unlink' ? 'unlinking' : 'connecting'}{' '}
              {pendingAction?.method.label}
            </DialogTitle>
            <DialogDescription>
              Use your current password or a connected provider. Verification lasts five minutes and
              works for this change only.
            </DialogDescription>
          </DialogHeader>

          {dialogError && (
            <p className="text-destructive text-sm" role="alert">
              {dialogError}
            </p>
          )}

          {proof ? (
            <p className="text-foreground text-sm" role="status" aria-live="polite">
              Identity verified. Continue to{' '}
              {pendingAction?.action === 'unlink' ? 'unlink' : 'connect'} this sign-in method.
            </p>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="sign-in-method-current-password">Current password</Label>
                <Input
                  id="sign-in-method-current-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  disabled={verifying}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!password || verifying}
                  onClick={() => void verifyWithPassword()}
                >
                  {verifying ? 'Verifying…' : 'Verify with password'}
                </Button>
              </div>

              {connectedVerificationMethods.length > 0 && (
                <div className="border-border/60 space-y-2 border-t pt-4">
                  <p className="text-muted-foreground text-sm">Or use a connected provider</p>
                  <div className="flex flex-wrap gap-2">
                    {connectedVerificationMethods.map(method => (
                      <Button
                        key={method.provider}
                        type="button"
                        variant="outline"
                        disabled={verifying}
                        onClick={() => void verifyWithProvider(method.provider)}
                      >
                        Verify with {method.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={Boolean(busyProvider) || verifying}
              onClick={() => setPendingAction(undefined)}
            >
              Cancel
            </Button>
            {proof && (
              <Button
                type="button"
                variant={pendingAction?.action === 'unlink' ? 'destructive' : 'default'}
                disabled={Boolean(busyProvider)}
                onClick={() => void completeAction()}
              >
                {busyProvider
                  ? pendingAction?.action === 'unlink'
                    ? 'Unlinking…'
                    : 'Connecting…'
                  : pendingAction?.action === 'unlink'
                    ? 'Unlink sign-in method'
                    : `Connect ${pendingAction?.method.label}`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
