import { captureAccountAnalyticsEvent } from '@/services/analytics-preference';
import { notify } from '@/lib/notifications';
import { useState, useEffect } from 'react';
import { usePostHog } from '@posthog/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import AuthForm from '@/components/auth/AuthForm';
import SocialLogin from '@/components/auth/SocialLogin';
import { GlassPanel } from '@/components/ui/glass-panel';

import { useAuth } from '@/hooks/useAuth';
import { registerWithPassword, loginWithOAuth2, type OAuthProvider } from '@/services/auth';
import { createLogger } from '@/utils/logger';
import { useAppReady, useHideSplash } from '@/hooks/useAppReady';
import { useNoIndexPage } from '@/hooks/usePageMetadata';
import { getAuthSuccessAnalyticsProperties } from '@/services/auth-analytics';
import { AnalyticsEvent } from '@/services/analytics-events';
import { extractAuthRedirectState, resolveAuthRedirectDestination } from '@/utils/auth/redirects';

const registrationLogger = createLogger('Register');

const Register = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const navigate = useNavigate();
  const location = useLocation();
  const posthog = usePostHog();
  const { isAuthenticated, isLoading, initialCheckComplete } = useAuth();
  const redirectTo = resolveAuthRedirectDestination(location.state);
  const authRedirectState = extractAuthRedirectState(location.state);

  const authPending = isLoading || !initialCheckComplete || isAuthenticated;
  const showAuthForm = !authPending;

  // Hide splash during the auth spinner so the form never flashes for an
  // already-authed user. Do not complete the failsafe until the form mounts;
  // a redirect onto a hung lazy page still needs the 30s Retry.
  useHideSplash(authPending);
  useAppReady(showAuthForm);

  // Prevent search engines from indexing auth pages
  useNoIndexPage('Register | Organized Glitter');

  // Check if user is already logged in
  useEffect(() => {
    if (!isLoading && initialCheckComplete && isAuthenticated) {
      navigate(redirectTo, { replace: true });
    }
  }, [isAuthenticated, isLoading, initialCheckComplete, navigate, redirectTo]);

  if (authPending) {
    return (
      <MainLayout currentPage="Register">
        <div
          className="flex min-h-[60vh] items-center justify-center gap-2"
          role="status"
          aria-live="polite"
        >
          <Loader2
            className="text-muted-foreground size-8 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          <span className="text-muted-foreground">Loading…</span>
        </div>
      </MainLayout>
    );
  }

  const handleRegister = async (
    data:
      | {
          email: string;
          password: string;
          confirmPassword: string;
          username: string;
        }
      | {
          email: string;
          password: string;
        }
  ) => {
    // Ensure we have the registration data structure
    if (!('confirmPassword' in data) || !('username' in data)) {
      setError('Registration requires password confirmation and username');
      return;
    }

    setLoading(true);
    setError(undefined);
    posthog.capture(AnalyticsEvent.REGISTRATION_STARTED, {
      auth_method: 'password',
      auth_provider: 'email',
      auth_entrypoint: 'register',
    });

    try {
      const result = await registerWithPassword(data);

      if (!result.success) {
        setError(result.error);
        return;
      }

      posthog.capture(
        AnalyticsEvent.AUTH_REGISTRATION_SUCCEEDED,
        getAuthSuccessAnalyticsProperties({
          method: 'password',
          provider: 'email',
          entrypoint: 'register',
          requiresEmailVerification: true,
        })
      );

      notify({
        kind: 'info',
        title: 'Verification Email Sent!',
        description:
          'Your account has been created. Please check your email to verify your account before logging in.',
        durationMs: 10000, // Keep message longer
      });

      // Navigate to email confirmation page
      navigate('/email-confirmation', {
        state: authRedirectState?.from
          ? {
              email: data.email,
              ...authRedirectState,
            }
          : { email: data.email },
        replace: true,
      });
    } catch (err) {
      registrationLogger.error('Registration error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleProviderLogin = async (provider: OAuthProvider) => {
    setLoading(true);
    setError(undefined);
    posthog.capture(AnalyticsEvent.REGISTRATION_STARTED, {
      auth_method: 'oauth',
      auth_provider: provider,
      auth_entrypoint: 'register',
    });

    try {
      const result = await loginWithOAuth2(provider);

      if (!result.success) {
        setError(result.error);
        return;
      }

      captureAccountAnalyticsEvent(
        AnalyticsEvent.AUTH_LOGIN_SUCCEEDED,
        getAuthSuccessAnalyticsProperties({
          method: 'oauth',
          provider,
          entrypoint: 'register',
        })
      );

      notify({
        kind: 'info',
        title: 'Registration successful!',
        description: 'Welcome to Organized Glitter!',
      });

      // Navigate immediately after successful OAuth registration
      navigate(redirectTo, { replace: true });
    } catch (err) {
      registrationLogger.error('OAuth signup error', { provider, error: err });
      setError('An unexpected sign-up error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout currentPage="Register">
      <section className="relative z-10 px-4 pt-16 pb-10 md:pt-28 md:pb-40">
        <div className="container mx-auto max-w-6xl">
          <div className="mx-auto w-full max-w-md">
            <GlassPanel className="px-6 py-8 md:px-10 md:py-12">
              <div className="mb-6 text-center">
                <h1 className="mb-4 text-3xl font-semibold md:text-4xl">
                  Join
                  <br />
                  <span className="text-primary">Organized Glitter</span>
                </h1>
                <p className="text-muted-foreground text-lg">
                  Create your account to start organizing your collection
                </p>
              </div>

              <AuthForm
                type="register"
                loading={loading}
                onSubmit={handleRegister}
                error={error}
                authRedirectState={authRedirectState}
              />

              <div className="mt-6">
                <SocialLogin onProviderLogin={handleProviderLogin} loading={loading} />
              </div>
            </GlassPanel>
          </div>
        </div>
      </section>
    </MainLayout>
  );
};

export default Register;
