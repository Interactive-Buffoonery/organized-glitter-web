import { notify } from '@/lib/notifications';
import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { logger } from '@/utils/logger';
import { MailCheck } from 'lucide-react';
import { isAuthenticated, getCurrentUserEmail, requestVerification } from '@/services/auth';

import { useAppReady } from '@/hooks/useAppReady';
import { useNoIndexPage } from '@/hooks/usePageMetadata';
import { extractAuthRedirectState } from '@/utils/auth/redirects';

const getResolvedEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;

  const email = value.trim();
  return email.length > 0 ? email : null;
};

const reportResendFailure = (error?: unknown) => {
  logger.error({ reason: 'resend_verification_failed', error });
  notify({
    kind: 'error',
    title: 'Confirmation email resend failed',
    description: 'Failed to resend confirmation email. Please try again later.',
  });
};

const EmailConfirmation = () => {
  useAppReady();

  // Prevent search engines from indexing auth pages
  useNoIndexPage('Check Your Email');

  const [resending, setResending] = useState(false);
  const routeLocation = useLocation();
  const navigate = useNavigate();
  const authRedirectState = extractAuthRedirectState(routeLocation.state);

  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const stateEmail = getResolvedEmail(routeLocation.state?.email);
    if (stateEmail) {
      setEmail(stateEmail);
      return;
    }

    if (isAuthenticated()) {
      setEmail(getResolvedEmail(getCurrentUserEmail()));
      return;
    }

    setEmail(null);
  }, [routeLocation.state]);

  const handleResendEmail = async () => {
    if (!email) return;

    setResending(true);
    try {
      const result = await requestVerification(email);
      if (!result.success) {
        reportResendFailure();
        return;
      }

      notify({
        kind: 'info',
        title: 'Confirmation email resent',
        description: 'Please check your inbox (and spam folder) for the confirmation email.',
      });
    } catch (error) {
      reportResendFailure(error);
    } finally {
      setResending(false);
    }
  };

  const handleBackToLogin = () => {
    if (authRedirectState) {
      navigate('/login', { state: authRedirectState, replace: true });
      return;
    }

    navigate('/login');
  };

  const displayEmail = email ?? 'your email address';
  const canResendEmail = email !== null;

  return (
    <MainLayout>
      <div className="flex min-h-[80vh] items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-4 text-center">
            <div className="flex justify-center">
              <div className="bg-primary/10 rounded-full p-3">
                <MailCheck className="text-primary size-8" />
              </div>
            </div>
            <CardTitle>Check Your Email</CardTitle>
            <CardDescription>
              Check <span className="text-foreground font-medium">{displayEmail}</span> for a
              confirmation link. If it is missing or expired, request a new one below.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-4 text-sm">
            <p>Didn't receive the email?</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Check your spam or junk folder</li>
              <li>Make sure you entered the correct email address</li>
              <li>Wait a few minutes for the email to arrive</li>
            </ul>
            <p className="text-muted-foreground mt-4 text-xs">
              The confirmation email comes from your configured mail sender for this deployment.
            </p>
          </CardContent>
          <CardFooter className="flex flex-col gap-y-3">
            <Button
              type="button"
              onClick={handleResendEmail}
              disabled={resending || !canResendEmail}
              className="w-full"
            >
              {resending ? 'Sending…' : 'Resend Confirmation Email'}
            </Button>
            <Button type="button" variant="outline" onClick={handleBackToLogin} className="w-full">
              Back to Login
            </Button>
          </CardFooter>
        </Card>
      </div>
    </MainLayout>
  );
};

export default EmailConfirmation;
