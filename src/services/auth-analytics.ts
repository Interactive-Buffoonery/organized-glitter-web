type AuthAnalyticsMethod = 'password' | 'oauth';
type AuthAnalyticsProvider = 'email' | 'apple' | 'google' | 'discord';
type AuthAnalyticsEntrypoint = 'login' | 'register';

interface AuthSuccessAnalyticsInput {
  method: AuthAnalyticsMethod;
  provider: AuthAnalyticsProvider;
  entrypoint: AuthAnalyticsEntrypoint;
  requiresEmailVerification?: boolean;
}

export function getAuthSuccessAnalyticsProperties({
  method,
  provider,
  entrypoint,
  requiresEmailVerification,
}: AuthSuccessAnalyticsInput) {
  return {
    auth_method: method,
    auth_provider: provider,
    auth_entrypoint: entrypoint,
    ...(requiresEmailVerification === undefined
      ? {}
      : { requires_email_verification: requiresEmailVerification }),
  };
}
