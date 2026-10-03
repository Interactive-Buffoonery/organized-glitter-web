import { notify } from '@/lib/notifications';
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { confirmEmailVerification } from '@/services/auth';
import { CheckCircle, XCircle, ArrowLeft, Mail } from 'lucide-react';
import { logger } from '@/utils/logger';
import { useAppReady } from '@/hooks/useAppReady';
import { useNoIndexPage } from '@/hooks/usePageMetadata';

const VerifyEmail = () => {
  useAppReady();

  // Prevent search engines from indexing auth pages
  useNoIndexPage('Verify Email');

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { token } = useParams<{ token: string }>();
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Automatically verify on mount
  useEffect(() => {
    let isActive = true;

    const verifyEmail = async () => {
      if (!token) {
        setError('Invalid or missing verification token');
        setLoading(false);
        notify({
          kind: 'error',
          title: 'Invalid verification link',
          description: 'The verification link is invalid or has expired',
        });
        return;
      }

      try {
        setLoading(true);
        const result = await confirmEmailVerification(token);

        if (!isActive) return;

        if (result.success) {
          setSuccess(true);
          notify({
            kind: 'info',
            title: 'Email verified successfully',
            description: 'Your email has been verified. You can now log in to your account.',
          });

          // Redirect to login after 3 seconds
          if (redirectTimeoutRef.current) {
            clearTimeout(redirectTimeoutRef.current);
          }

          redirectTimeoutRef.current = setTimeout(() => {
            navigate('/login');
          }, 3000);
        } else {
          setError(result.error || 'Failed to verify email');
          notify({
            kind: 'error',
            title: 'Verification failed',
            description: result.error || 'Failed to verify email. Please try again.',
          });
        }
      } catch (err) {
        if (!isActive) return;
        logger.error('Email verification error:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to verify email';
        setError(errorMessage);
        notify({ kind: 'error', title: 'Verification failed', description: errorMessage });
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    verifyEmail();
    return () => {
      isActive = false;
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, [token, navigate]);

  return (
    <MainLayout>
      <div className="diamond-pattern flex min-h-[80vh] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-semibold">Email Verification</h1>
            <p className="text-muted-foreground mt-2">
              {loading && 'Verifying your email address…'}
              {success && 'Your email has been successfully verified'}
              {error && 'There was a problem verifying your email'}
            </p>
          </div>

          <Card className="glass-card mx-auto w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl font-bold">
                {loading && <Mail className="size-6" />}
                {success && <CheckCircle className="size-6 text-green-600" />}
                {error && <XCircle className="size-6 text-red-600" />}
                {loading && 'Verifying Email…'}
                {success && 'Email Verified!'}
                {error && 'Verification Failed'}
              </CardTitle>
              <CardDescription>
                {loading && 'Please wait while we verify your email address'}
                {success && 'Your account is now fully activated'}
                {error && "We couldn't verify your email address"}
              </CardDescription>
            </CardHeader>

            <CardContent>
              <div className="py-4 text-center">
                {loading && (
                  <div className="space-y-4">
                    <div className="border-primary mx-auto size-8 animate-spin rounded-full border-2 border-t-transparent" />
                    <p className="text-muted-foreground text-sm">Verifying your email address…</p>
                  </div>
                )}

                {success && (
                  <div className="space-y-4">
                    <CheckCircle className="mx-auto size-12 text-green-600" />
                    <div>
                      <p className="mb-2">Your email has been successfully verified!</p>
                      <p className="text-muted-foreground text-sm">
                        You can now log in to your account and start using Organized Glitter.
                      </p>
                      <p className="text-muted-foreground mt-2 text-sm">
                        You will be redirected to the login page in a few seconds…
                      </p>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="space-y-4">
                    <XCircle className="mx-auto size-12 text-red-600" />
                    <div>
                      <p className="mb-2 font-medium text-red-600">Verification Failed</p>
                      <p className="text-muted-foreground mb-4 text-sm">{error}</p>
                      <div className="space-y-2">
                        <Button
                          onClick={() => navigate('/email-confirmation')}
                          className="w-full"
                          variant="default"
                        >
                          Request New Verification Email
                        </Button>
                        <Button
                          onClick={() => navigate('/login')}
                          className="w-full"
                          variant="outline"
                        >
                          Back to Login
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>

            {!loading && !error && (
              <div className="px-6 pb-6">
                <div className="w-full text-center">
                  <Button
                    variant="link"
                    onClick={() => navigate('/login')}
                    className="text-accent hover:underline"
                  >
                    <ArrowLeft className="mr-2 size-4" />
                    Back to Login
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </MainLayout>
  );
};

export default VerifyEmail;
