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

import { requestPasswordReset } from '@/services/auth';
import { Mail, ArrowLeft } from 'lucide-react';
import { logger } from '@/utils/logger';
import { useAppReady } from '@/hooks/useAppReady';
import { useNoIndexPage } from '@/hooks/usePageMetadata';

const ForgotPassword = () => {
  useAppReady();

  // Prevent search engines from indexing auth pages
  useNoIndexPage('Forgot Password | Organized Glitter');

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      notify({
        kind: 'error',
        title: 'Email required',
        description: 'Please enter your email address',
      });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      notify({
        kind: 'error',
        title: 'Invalid Email',
        description: 'Please enter a valid email address',
      });
      return;
    }

    setLoading(true);

    try {
      const result = await requestPasswordReset(email);

      if (!result.success) {
        throw new Error(result.error || 'Failed to send reset email');
      }

      setSubmitted(true);
      notify({
        kind: 'info',
        title: 'Password reset email sent',
        description: 'Check your email for a link to reset your password',
      });
    } catch (error: unknown) {
      logger.error('Password reset error:', error);

      const errorMessage =
        error instanceof Error ? error.message : 'Failed to send reset email. Please try again.';
      notify({ kind: 'error', title: 'Password reset request failed', description: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="flex min-h-[80vh] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-semibold">Reset Password</h1>
            <p className="text-muted-foreground mt-2">
              {!submitted
                ? 'Enter your email to receive a password reset link'
                : 'Check your email for the reset link'}
            </p>
          </div>

          <Card className="glass-card mx-auto w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-2xl font-bold">Forgot Password</CardTitle>
              <CardDescription>
                {!submitted
                  ? "We'll send you an email with a link to reset your password"
                  : 'Reset link sent! Check your inbox'}
              </CardDescription>
            </CardHeader>

            <CardContent>
              {!submitted ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="text-muted-foreground absolute top-3 left-3 size-4" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="Enter your email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="pl-10"
                        required
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Sending...' : 'Send Reset Link'}
                  </Button>
                </form>
              ) : (
                <div className="py-4 text-center">
                  <Mail className="text-primary mx-auto mb-4 size-12" />
                  <p className="mb-4">
                    We've sent a password reset link to <strong>{email}</strong>
                  </p>
                  <p className="text-muted-foreground text-sm">
                    If you don't see it in your inbox, please check your spam folder.
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

export default ForgotPassword;
