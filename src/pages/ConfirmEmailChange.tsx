import { notify } from '@/lib/notifications';
import React, { useState, useEffect } from 'react';
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
import { logger } from '@/utils/logger';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { confirmEmailChange } from '@/services/auth';
import { hasErrorStatus } from '@/services/errors';
import { Lock, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';
import { useAppReady } from '@/hooks/useAppReady';
import { useNoIndexPage } from '@/hooks/usePageMetadata';

const ConfirmEmailChange = () => {
  useAppReady();

  // Prevent search engines from indexing auth pages
  useNoIndexPage('Confirm Email Change');

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { token } = useParams<{ token: string }>();

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      notify({
        kind: 'error',
        title: 'Invalid or missing link',
        description: 'Please use the link from your email to confirm the change',
      });
      navigate('/login');
    }
  }, [token, navigate]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!password) {
      setError('Please enter your current password');
      return;
    }

    if (!token) {
      setError('Email change token is missing or invalid');
      return;
    }

    setLoading(true);

    try {
      // Confirm email change through the auth service
      const result = await confirmEmailChange(token, password);

      if (result.success) {
        setSuccess(true);
        notify({
          kind: 'info',
          title: 'Email changed successfully',
          description: 'Your email has been updated. Please log in again.',
        });

        // Clear form
        setPassword('');

        // Redirect to login after 3 seconds
        setTimeout(() => {
          navigate('/login');
        }, 3000);
      } else {
        throw new Error(result.error || 'Email change confirmation failed');
      }
    } catch (err: unknown) {
      logger.criticalError('Email change confirmation error', err);

      let errorMessage = 'Failed to confirm email change. Please try again.';

      if (hasErrorStatus(err, 400)) {
        errorMessage = 'Invalid token or password. Please check your credentials.';
      } else if (hasErrorStatus(err, 404)) {
        errorMessage = 'Invalid or expired confirmation link.';
      } else if (hasErrorStatus(err, 429)) {
        errorMessage = 'Too many attempts. Please try again later.';
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return null; // Will redirect via useEffect
  }

  return (
    <MainLayout>
      <div className="diamond-pattern flex min-h-[80vh] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-semibold">Confirm Email Change</h1>
            <p className="text-muted-foreground mt-2">
              {!success
                ? 'Enter your password to confirm the change'
                : 'Your email has been successfully updated'}
            </p>
          </div>

          <Card className="glass-card mx-auto w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-2xl font-bold">
                {!success ? 'Confirm Email Change' : 'Email Change Complete'}
              </CardTitle>
              <CardDescription>
                {!success
                  ? 'Enter your current password to complete the email change'
                  : 'You will be logged out and redirected to login'}
              </CardDescription>
            </CardHeader>

            <CardContent>
              {!success ? (
                <>
                  {/* Security notice */}
                  <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/20">
                    <div className="flex items-start gap-x-2 text-sm">
                      <AlertCircle className="mt-0.5 size-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />
                      <div className="text-blue-800 dark:text-blue-200">
                        <p className="mb-1 font-medium">Security verification required</p>
                        <p className="text-xs">
                          We need your current password to confirm this email change for security
                          purposes.
                        </p>
                      </div>
                    </div>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="password">Current Password</Label>
                      <div className="relative">
                        <Lock className="text-muted-foreground absolute top-3 left-3 size-4" />
                        <Input
                          id="password"
                          type="password"
                          placeholder="Enter your current password"
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          className="pl-10"
                          required
                          autoComplete="current-password"
                        />
                      </div>
                    </div>

                    {error && (
                      <div className="bg-destructive/10 text-destructive-text rounded-lg p-3 text-sm">
                        {error}
                      </div>
                    )}

                    <div className="bg-muted/50 text-muted-foreground rounded-lg p-3 text-sm">
                      <p className="mb-2 font-medium">After confirmation:</p>
                      <ol className="list-inside list-decimal space-y-1 text-xs">
                        <li>Your email address will be updated</li>
                        <li>You'll be automatically logged out</li>
                        <li>Use your new email to log in next time</li>
                      </ol>
                    </div>

                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? 'Confirming…' : 'Confirm Email Change'}
                    </Button>
                  </form>
                </>
              ) : (
                <div className="py-4 text-center">
                  <CheckCircle className="text-primary mx-auto mb-4 size-12" />
                  <p className="mb-4">Your email address has been successfully updated</p>
                  <p className="text-muted-foreground text-sm">
                    You will be logged out and redirected to the login page in a few seconds…
                  </p>
                </div>
              )}
            </CardContent>

            <CardFooter>
              <div className="w-full text-center">
                <Button
                  variant="link"
                  onClick={() => navigate('/login')}
                  className="text-accent hover:underline"
                  disabled={success}
                >
                  <ArrowLeft className="mr-2 size-4" />
                  Back to Login
                </Button>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
};

export default ConfirmEmailChange;
