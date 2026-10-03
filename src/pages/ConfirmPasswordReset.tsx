import { notify } from '@/lib/notifications';
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { confirmPasswordReset } from '@/services/auth';
import { Lock, ArrowLeft, CheckCircle } from 'lucide-react';
import { logger } from '@/utils/logger';
import { useAppReady } from '@/hooks/useAppReady';
import { useNoIndexPage } from '@/hooks/usePageMetadata';
import { validatePasswordStrength } from '@/utils/auth/passwordValidation';

const INVALID_RESET_LINK_MESSAGE =
  'Invalid or expired reset link. Please request a new password reset.';
const PASSWORD_RESET_ERROR_ID = 'password-reset-error';

type PasswordField = 'password' | 'confirmPassword';

const ConfirmPasswordReset = () => {
  useAppReady();

  // Prevent search engines from indexing auth pages
  useNoIndexPage('Reset Your Password');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorFields, setErrorFields] = useState<PasswordField[]>([]);
  const navigate = useNavigate();
  const { token } = useParams<{ token: string }>();
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInvalidResetLink = error === INVALID_RESET_LINK_MESSAGE;

  const clearError = () => {
    setError(null);
    setErrorFields([]);
  };

  const setValidationError = (message: string, fields: PasswordField[] = []) => {
    setError(message);
    setErrorFields(fields);
  };

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      notify({
        kind: 'error',
        title: 'Invalid or expired link',
        description: 'Please request a new password reset link',
      });
      navigate('/forgot-password');
    }
  }, [token, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    const missingFields: PasswordField[] = [];
    if (!password) missingFields.push('password');
    if (!confirmPassword) missingFields.push('confirmPassword');
    if (missingFields.length > 0) {
      setValidationError('Please fill in all fields', missingFields);
      return;
    }

    if (password !== confirmPassword) {
      setValidationError('Passwords do not match', ['confirmPassword']);
      return;
    }

    // Validate password strength (match ChangePassword component requirements)
    const passwordErrors = validatePasswordStrength(password);
    if (passwordErrors.length > 0) {
      setValidationError(passwordErrors.join('. '), ['password']);
      return;
    }

    if (!token) {
      setValidationError('Invalid reset token');
      return;
    }

    setLoading(true);

    try {
      // Confirm password reset via auth service
      const result = await confirmPasswordReset(token, password, confirmPassword);
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to reset password');
      }

      setSuccess(true);
      notify({
        kind: 'info',
        title: 'Password updated',
        description: 'Your password has been successfully reset',
      });

      // Clear form
      setPassword('');
      setConfirmPassword('');

      // Redirect to login after 3 seconds
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }

      redirectTimeoutRef.current = setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err: unknown) {
      logger.error('Password reset error:', err);

      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Failed to reset password. Please try again.';
      const normalizedErrorMessage = errorMessage.toLowerCase();

      // Handle specific PocketBase errors
      if (
        normalizedErrorMessage.includes('token') ||
        normalizedErrorMessage.includes('expired') ||
        normalizedErrorMessage.includes('not found')
      ) {
        setValidationError(INVALID_RESET_LINK_MESSAGE);
      } else if (normalizedErrorMessage.includes('password')) {
        setValidationError(
          'Password does not meet requirements. Please try a different password.',
          ['password']
        );
      } else {
        setValidationError(errorMessage);
      }

      notify({ kind: 'error', title: 'Password reset failed', description: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

  return (
    <MainLayout>
      <div className="diamond-pattern flex min-h-[80vh] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-semibold">Reset Your Password</h1>
            <p className="text-muted-foreground mt-2">
              {!success
                ? 'Create a new password for your account'
                : 'Your password has been successfully reset'}
            </p>
          </div>

          <Card className="glass-card mx-auto w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-2xl font-bold">
                {!success ? 'Create New Password' : 'Password Reset Complete'}
              </CardTitle>
              <CardDescription>
                {!success
                  ? 'Your new password must be at least 8 characters long and contain uppercase, lowercase, and numeric characters'
                  : 'You can now log in with your new password'}
              </CardDescription>
            </CardHeader>

            <CardContent>
              {!success ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">New Password</Label>
                    <div className="relative">
                      <Lock className="text-muted-foreground absolute top-3 left-3 size-4" />
                      <Input
                        id="password"
                        type="password"
                        placeholder="Enter your new password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="pl-10"
                        required
                        autoComplete="new-password"
                        aria-invalid={errorFields.includes('password')}
                        aria-describedby={error ? PASSWORD_RESET_ERROR_ID : undefined}
                        disabled={loading}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm New Password</Label>
                    <div className="relative">
                      <Lock className="text-muted-foreground absolute top-3 left-3 size-4" />
                      <Input
                        id="confirm-password"
                        type="password"
                        placeholder="Confirm your new password"
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        className="pl-10"
                        required
                        autoComplete="new-password"
                        aria-invalid={errorFields.includes('confirmPassword')}
                        aria-describedby={error ? PASSWORD_RESET_ERROR_ID : undefined}
                        disabled={loading}
                      />
                    </div>
                  </div>

                  {error && (
                    <p
                      id={PASSWORD_RESET_ERROR_ID}
                      className="text-destructive-text text-sm"
                      role="alert"
                    >
                      {error}
                    </p>
                  )}

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Resetting...' : 'Reset Password'}
                  </Button>
                </form>
              ) : (
                <div className="py-4 text-center">
                  <CheckCircle className="text-primary mx-auto mb-4 size-12" />
                  <p className="mb-4">Your password has been successfully reset</p>
                  <p className="text-muted-foreground text-sm">
                    You will be redirected to the login page in a few seconds…
                  </p>
                </div>
              )}
            </CardContent>

            <CardFooter>
              <div className="w-full text-center">
                <Button
                  type="button"
                  variant="link"
                  onClick={() => navigate(hasInvalidResetLink ? '/forgot-password' : '/login')}
                  className="text-accent hover:underline"
                >
                  <ArrowLeft className="mr-2 size-4" />
                  {hasInvalidResetLink ? 'Request New Reset Link' : 'Back to Login'}
                </Button>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
};

export default ConfirmPasswordReset;
