import { notify } from '@/lib/notifications';
import React, { useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useAuth } from '@/hooks/useAuth';
import { requestEmailChange } from '@/services/auth';
import { hasErrorStatus, getErrorMessage } from '@/services/errors';
import { Mail, ArrowLeft, CheckCircle, Shield } from 'lucide-react';
import { logger } from '@/utils/logger';
import { useAppReady } from '@/hooks/useAppReady';
import { useNoIndexPage } from '@/hooks/usePageMetadata';

/**
 * ChangeEmail component for securely changing user email address
 * Follows PocketBase best practices for email change requests
 */

const ChangeEmail = () => {
  useAppReady();

  // Prevent search engines from indexing auth pages
  useNoIndexPage('Change Email');

  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Redirect if not authenticated
  React.useEffect(() => {
    if (!user) {
      notify({
        kind: 'error',
        title: 'Authentication required',
        description: 'Please log in to change your email address',
      });
      navigate('/login');
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!newEmail) {
      notify({
        kind: 'error',
        title: 'Email required',
        description: 'Please enter your new email address',
      });
      return;
    }

    if (newEmail === user?.email) {
      notify({
        kind: 'error',
        title: 'Email unchanged',
        description: 'New email must be different from your current email',
      });
      return;
    }

    // Comprehensive email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      notify({
        kind: 'error',
        title: 'Invalid email',
        description: 'Please enter a valid email address',
      });
      return;
    }

    // Additional validation for email length and format
    if (newEmail.length > 254) {
      notify({
        kind: 'error',
        title: 'Email too long',
        description: 'Email address is too long',
      });
      return;
    }

    setLoading(true);

    try {
      // Request email change through the auth service
      await requestEmailChange(newEmail);

      setSubmitted(true);
      notify({
        kind: 'info',
        title: 'Email change request sent',
        description: 'Check your new email for a confirmation link',
      });
    } catch (error: unknown) {
      logger.error('Email change request error', error);

      let errorMessage = 'Failed to request email change. Please try again.';

      if (hasErrorStatus(error, 400)) {
        errorMessage = 'Invalid email address or email already in use.';
      } else if (hasErrorStatus(error, 429)) {
        errorMessage = 'Too many requests. Please try again later.';
      } else {
        errorMessage = getErrorMessage(error);
      }

      notify({ kind: 'error', title: 'Email change request failed', description: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return null; // Will redirect via useEffect
  }

  return (
    <MainLayout>
      <div className="diamond-pattern flex min-h-[80vh] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-semibold">Change Email</h1>
            <p className="text-muted-foreground mt-2">
              {!submitted ? 'Update your email address' : 'Confirmation email sent'}
            </p>
          </div>

          <Card className="glass-card mx-auto w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-2xl font-bold">Change Email Address</CardTitle>
              <CardDescription>
                {!submitted
                  ? "Enter your new email address. You'll receive a confirmation link."
                  : 'Please check your new email for a confirmation link'}
              </CardDescription>
            </CardHeader>

            <CardContent>
              {!submitted ? (
                <>
                  {/* Current email display */}
                  <div className="bg-muted mb-6 rounded-lg p-4">
                    <div className="flex items-center gap-x-2 text-sm">
                      <Shield className="text-muted-foreground size-4" />
                      <span className="text-muted-foreground">Current email:</span>
                      <span className="font-medium">{user.email}</span>
                    </div>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-email">New Email Address</Label>
                      <div className="relative">
                        <Mail className="text-muted-foreground absolute top-3 left-3 size-4" />
                        <Input
                          id="new-email"
                          type="email"
                          placeholder="Enter your new email"
                          value={newEmail}
                          onChange={e => setNewEmail(e.target.value)}
                          className="pl-10"
                          required
                          autoComplete="email"
                        />
                      </div>
                    </div>

                    <div className="bg-muted/50 text-muted-foreground rounded-lg p-3 text-sm">
                      <p className="mb-2 font-medium">What happens next:</p>
                      <ol className="list-inside list-decimal space-y-1 text-xs">
                        <li>We'll send a confirmation link to your new email</li>
                        <li>Click the link to confirm the change</li>
                        <li>Your email will be updated after confirmation</li>
                        <li>You'll need to log in again with your new email</li>
                      </ol>
                    </div>

                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? 'Sending...' : 'Send Confirmation Email'}
                    </Button>
                  </form>
                </>
              ) : (
                <div className="py-4 text-center">
                  <CheckCircle className="text-primary mx-auto mb-4 size-12" />
                  <p className="mb-4">
                    We've sent a confirmation link to <strong>{newEmail}</strong>
                  </p>
                  <div className="text-muted-foreground space-y-2 text-sm">
                    <p>Click the link in the email to confirm your new address.</p>
                    <p>If you don't see it, please check your spam folder.</p>
                    <p className="font-medium">
                      Your current email ({user.email}) will remain active until you confirm the
                      change.
                    </p>
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

export default ChangeEmail;
