import { notify } from '@/lib/notifications';
import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { logger } from '@/utils/logger';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useAuth } from '@/hooks/useAuth';
import { changePassword } from '@/services/auth';
import { hasErrorStatus, getErrorMessage } from '@/services/errors';
import { Lock, ArrowLeft, CheckCircle, Shield, Eye, EyeOff } from 'lucide-react';
import { useAppReady } from '@/hooks/useAppReady';
import { useNoIndexPage } from '@/hooks/usePageMetadata';
import { validatePasswordStrength } from '@/utils/auth/passwordValidation';
import { confirmAccountDraftRemoval } from '@/hooks/drafts/confirmAccountDraftRemoval';
import { clearAccountDrafts } from '@/hooks/drafts/formDraftStorage';
import { POCKETBASE_URL } from '@/lib/pocketbaseConfig';
import { getStructuredErrorReason } from '@/utils/error/structuredErrorReason';

type PasswordErrorReason =
  | 'current-password-required'
  | 'new-password-required'
  | 'confirmation-required'
  | 'password-mismatch'
  | 'password-unchanged'
  | 'password-strength'
  | 'request-failed';

type PasswordFormError = {
  reason: PasswordErrorReason | string;
  message: string;
};

const ChangePassword = () => {
  useAppReady();

  // Prevent search engines from indexing auth pages
  useNoIndexPage('Change Password');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<PasswordFormError | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Redirect if not authenticated
  React.useEffect(() => {
    if (!user) {
      notify({
        kind: 'error',
        title: 'Authentication required',
        description: 'Please log in to change your password',
      });
      navigate('/login');
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword) {
      setError({
        reason: 'current-password-required',
        message: 'Please enter your current password',
      });
      return;
    }

    if (!newPassword) {
      setError({ reason: 'new-password-required', message: 'Please enter a new password' });
      return;
    }

    if (!confirmPassword) {
      setError({ reason: 'confirmation-required', message: 'Please confirm your new password' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setError({ reason: 'password-mismatch', message: 'New passwords do not match' });
      return;
    }

    if (currentPassword === newPassword) {
      setError({
        reason: 'password-unchanged',
        message: 'New password must be different from your current password',
      });
      return;
    }

    // Validate new password strength
    const passwordErrors = validatePasswordStrength(newPassword);
    if (passwordErrors.length > 0) {
      setError({ reason: 'password-strength', message: passwordErrors.join('. ') });
      return;
    }
    if (
      !confirmAccountDraftRemoval(
        user?.id,
        'Changing your password will sign you out and remove unfinished drafts saved on this device. Continue?'
      )
    )
      return;

    setLoading(true);

    try {
      // Use the auth service to change the password
      const result = await changePassword(currentPassword, newPassword, confirmPassword);
      if (!result.success) {
        setError({
          reason: result.reason ?? 'request-failed',
          message: result.error || 'Password change failed',
        });
        return;
      }
      if (
        user?.id &&
        !clearAccountDrafts({
          backendUrl: POCKETBASE_URL,
          accountId: user.id,
        })
      ) {
        notify({
          kind: 'warning',
          title: 'Local drafts could not be cleared',
          description:
            'Clear this site’s browser data to remove unfinished drafts from this device.',
        });
      }
      setSuccess(true);
      notify({
        kind: 'info',
        title: 'Password changed successfully',
        description: 'Your password has been updated. Please log in again for security.',
      });

      // Clear form for security
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Log out the user and redirect to login after 3 seconds for security
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }

      redirectTimeoutRef.current = setTimeout(async () => {
        await signOut();
        navigate('/login');
      }, 3000);
    } catch (err: unknown) {
      logger.criticalError('Password change error', err);

      let errorMessage = 'Failed to change password. Please try again.';

      if (hasErrorStatus(err, 400)) {
        const msg = getErrorMessage(err);
        if (msg.includes('password') || msg.includes('auth')) {
          errorMessage = 'Current password is incorrect.';
        } else if (msg.includes('validation')) {
          errorMessage = 'Password does not meet security requirements.';
        } else {
          errorMessage = msg || 'Invalid request. Please check your input.';
        }
      } else if (hasErrorStatus(err, 401)) {
        errorMessage = 'Current password is incorrect.';
      } else if (hasErrorStatus(err, 403)) {
        errorMessage = 'Not authorized to change password.';
      } else if (hasErrorStatus(err, 429)) {
        errorMessage = 'Too many attempts. Please try again later.';
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }

      setError({
        reason: getStructuredErrorReason(err) ?? 'request-failed',
        message: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

  if (!user) {
    return null; // Will redirect via useEffect
  }

  return (
    <MainLayout>
      <div className="diamond-pattern flex min-h-[80vh] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-semibold">Change Password</h1>
            <p className="text-muted-foreground mt-2">
              {!success ? 'Update your account password' : 'Password changed successfully'}
            </p>
          </div>

          <Card className="glass-card mx-auto w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-2xl font-bold">
                {!success ? 'Change Password' : 'Password Change Complete'}
              </CardTitle>
              <CardDescription>
                {!success
                  ? 'Enter your current password and choose a new secure password'
                  : 'You will be logged out for security purposes'}
              </CardDescription>
            </CardHeader>

            <CardContent>
              {!success ? (
                <>
                  {/* Security notice */}
                  <div className="bg-muted mb-6 rounded-lg p-4">
                    <div className="flex items-center gap-x-2 text-sm">
                      <Shield className="text-muted-foreground size-4" />
                      <span className="text-muted-foreground">Signed in as:</span>
                      <span className="font-medium">{user.email}</span>
                    </div>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="current-password">Current Password</Label>
                      <div className="relative">
                        <Lock className="text-muted-foreground absolute top-3 left-3 size-4" />
                        <Input
                          id="current-password"
                          type={showCurrentPassword ? 'text' : 'password'}
                          placeholder="Enter your current password"
                          value={currentPassword}
                          onChange={e => setCurrentPassword(e.target.value)}
                          className="pr-10 pl-10"
                          required
                          autoComplete="current-password"
                        />

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
                          aria-label="Show current password"
                          aria-pressed={showCurrentPassword}
                          aria-controls="current-password"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        >
                          {showCurrentPassword ? (
                            <EyeOff className="size-4" />
                          ) : (
                            <Eye className="size-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="new-password">New Password</Label>
                      <div className="relative">
                        <Lock className="text-muted-foreground absolute top-3 left-3 size-4" />
                        <Input
                          id="new-password"
                          type={showNewPassword ? 'text' : 'password'}
                          placeholder="Enter your new password"
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          className="pr-10 pl-10"
                          required
                          autoComplete="new-password"
                        />

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
                          aria-label="Show new password"
                          aria-pressed={showNewPassword}
                          aria-controls="new-password"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                        >
                          {showNewPassword ? (
                            <EyeOff className="size-4" />
                          ) : (
                            <Eye className="size-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirm-password">Confirm New Password</Label>
                      <div className="relative">
                        <Lock className="text-muted-foreground absolute top-3 left-3 size-4" />
                        <Input
                          id="confirm-password"
                          type={showConfirmPassword ? 'text' : 'password'}
                          placeholder="Confirm your new password"
                          value={confirmPassword}
                          onChange={e => setConfirmPassword(e.target.value)}
                          className="pr-10 pl-10"
                          required
                          autoComplete="new-password"
                        />

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
                          aria-label="Show confirm new password"
                          aria-pressed={showConfirmPassword}
                          aria-controls="confirm-password"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="size-4" />
                          ) : (
                            <Eye className="size-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Password requirements */}
                    <div className="bg-muted/50 text-muted-foreground rounded-lg p-3 text-sm">
                      <p className="mb-2 font-medium">Password requirements:</p>
                      <ul className="list-inside list-disc space-y-1 text-xs">
                        <li>At least 8 characters long</li>
                        <li>Contains uppercase and lowercase letters</li>
                        <li>Contains at least one number</li>
                        <li>Different from your current password</li>
                      </ul>
                    </div>

                    {error && (
                      <div
                        className="bg-destructive/10 text-destructive-text rounded-lg p-3 text-sm"
                        role="alert"
                        data-reason={error.reason}
                      >
                        {error.message}
                      </div>
                    )}

                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? 'Changing...' : 'Change Password'}
                    </Button>
                  </form>
                </>
              ) : (
                <div className="py-4 text-center">
                  <CheckCircle className="text-primary mx-auto mb-4 size-12" />
                  <p className="mb-4">Your password has been successfully changed</p>
                  <div className="text-muted-foreground space-y-2 text-sm">
                    <p>For security purposes, you will be automatically logged out.</p>
                    <p>Please log in again with your new password.</p>
                  </div>
                </div>
              )}
            </CardContent>

            <CardFooter>
              <div className="w-full text-center">
                <Button
                  variant="link"
                  onClick={() => navigate('/profile')}
                  className="text-accent hover:underline"
                  disabled={success}
                >
                  <ArrowLeft className="mr-2 size-4" />
                  Back to Profile
                </Button>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
};

export default ChangePassword;
