import { captureAccountAnalyticsEvent } from '@/services/analytics-preference';
import { notify } from '@/lib/notifications';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import AuthForm from '@/components/auth/AuthForm';
import SocialLogin from '@/components/auth/SocialLogin';
import { GlassPanel } from '@/components/ui/glass-panel';

import { useAuth } from '@/hooks/useAuth';
import { loginWithPassword, loginWithOAuth2, type OAuthProvider } from '@/services/auth';
import { focusWhenRootInteractive } from '@/utils/focusWhenRootInteractive';
import { createLogger } from '@/utils/logger';
import { useAppReady, useHideSplash } from '@/hooks/useAppReady';
import { useNoIndexPage } from '@/hooks/usePageMetadata';
import { getAuthSuccessAnalyticsProperties } from '@/services/auth-analytics';
import { AnalyticsEvent } from '@/services/analytics-events';
import { extractAuthRedirectState, resolveAuthRedirectDestination } from '@/utils/auth/redirects';

const loginLogger = createLogger('Login');

const Login = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [verificationEmail, setVerificationEmail] = useState<string | undefined>();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading, initialCheckComplete } = useAuth();
  const redirectTo = resolveAuthRedirectDestination(location.state);
  const authRedirectState = extractAuthRedirectState(location.state);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const postLoginDestinationRef = useRef<string | null>(null);
  const postLoginDestination = useCallback(() => {
    if (!postLoginDestinationRef.current) {
      postLoginDestinationRef.current = redirectTo;
    }
    return postLoginDestinationRef.current;
  }, [redirectTo]);

  const authPending = isLoading || !initialCheckComplete || isAuthenticated;
  const showAuthForm = !authPending;

  // Hide splash during the auth spinner so the form never flashes for an
  // already-authed user. Do not complete the failsafe until the form mounts;
  // a redirect onto a hung lazy page still needs the 30s Retry.
  useHideSplash(authPending);
  useAppReady(showAuthForm);

  // Prevent search engines from indexing auth pages
  useNoIndexPage('Login | Organized Glitter');

  useEffect(() => {
    if (authRedirectState?.sessionExpired && showAuthForm) {
      return focusWhenRootInteractive(headingRef.current);
    }
  }, [authRedirectState?.sessionExpired, showAuthForm]);

  // Check if user is already logged in using auth context
  useEffect(() => {
    // Only redirect if auth is fully loaded and user is authenticated
    if (!isLoading && initialCheckComplete && isAuthenticated) {
      navigate(postLoginDestination(), { replace: true });
    }
  }, [isAuthenticated, isLoading, initialCheckComplete, navigate, postLoginDestination]);

  if (authPending) {
    return (
      <MainLayout currentPage="Login">
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

  const handleLogin = async (data: { email: string; password: string }) => {
    setLoading(true);
    setError(undefined);
    setVerificationEmail(undefined);

    loginLogger.debug('Password login attempt started');

    try {
      const result = await loginWithPassword(data);

      if (!result.success) {
        loginLogger.warn('Password login failed');
        setError(result.error);
        setVerificationEmail(
          result.recovery?.type === 'email-verification' ? result.recovery.email : undefined
        );
        return;
      }

      loginLogger.debug('Login successful, preparing navigation');
      captureAccountAnalyticsEvent(
        AnalyticsEvent.AUTH_LOGIN_SUCCEEDED,
        getAuthSuccessAnalyticsProperties({
          method: 'password',
          provider: 'email',
          entrypoint: 'login',
        })
      );

      notify({
        kind: 'info',
        title: 'Login successful',
        description: 'Welcome back to Organized Glitter!',
      });

      // Navigate immediately after successful login
      // PocketBase authStore is already updated when this callback runs
      navigate(postLoginDestination(), { replace: true });
    } catch (err) {
      loginLogger.error('Unexpected password login error');

      // Provide a user-friendly error message
      let errorMessage = 'An unexpected error occurred. Please try again.';

      if (err instanceof Error) {
        // Check for network-related errors
        if (
          err.message.toLowerCase().includes('network') ||
          err.message.toLowerCase().includes('fetch')
        ) {
          errorMessage = 'Connection error. Please check your internet connection and try again.';
        }
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleProviderLogin = async (provider: OAuthProvider) => {
    setLoading(true);
    setError(undefined);
    setVerificationEmail(undefined);

    loginLogger.debug('OAuth login attempt started', { provider });

    try {
      const result = await loginWithOAuth2(provider);

      if (!result.success) {
        loginLogger.warn('OAuth login failed', { provider });
        setError(result.error);
        return;
      }

      loginLogger.debug('OAuth login successful', { provider });
      captureAccountAnalyticsEvent(
        AnalyticsEvent.AUTH_LOGIN_SUCCEEDED,
        getAuthSuccessAnalyticsProperties({
          method: 'oauth',
          provider,
          entrypoint: 'login',
        })
      );

      notify({
        kind: 'info',
        title: 'Login successful',
        description: 'Welcome back to Organized Glitter!',
      });

      // Navigate immediately after successful OAuth login
      navigate(postLoginDestination(), { replace: true });
    } catch {
      loginLogger.error('Unexpected OAuth login error', { provider });
      setError('An unexpected sign-in error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout currentPage="Login">
      <section className="relative z-10 px-4 pt-16 pb-10 md:pt-28 md:pb-40">
        <div className="container mx-auto max-w-6xl">
          <div className="mx-auto w-full max-w-md">
            <GlassPanel className="px-6 py-8 md:px-10 md:py-12">
              <div className="mb-6 text-center">
                <h1
                  ref={headingRef}
                  tabIndex={-1}
                  className="mb-4 text-3xl font-semibold md:text-4xl"
                >
                  Welcome Back to
                  <br />
                  <span className="text-primary">Organized Glitter</span>
                </h1>
                <p className="text-muted-foreground text-lg">
                  {authRedirectState?.sessionExpired
                    ? 'Your session expired. Sign in again to continue.'
                    : 'Sign in to access your coloring and diamond art collection'}
                </p>
              </div>

              <AuthForm
                type="login"
                onSubmit={handleLogin}
                loading={loading}
                error={error}
                verificationEmail={verificationEmail}
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

export default Login;
