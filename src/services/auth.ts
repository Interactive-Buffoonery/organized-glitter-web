export {
  getAuthToken,
  getCurrentUser,
  getCurrentUserEmail,
  getCurrentUserId,
  isAuthenticated,
  logout,
  onAuthChange,
  requireAuthenticatedUser,
} from './auth/state';
export { loginWithPassword, registerWithPassword } from './auth/local';
export { loginWithOAuth2 } from './auth/oauth';
export {
  connectOAuthProvider,
  listAccountSignInMethods,
  listConfiguredOAuthProviders,
  OAUTH_PROVIDER_LABELS,
  requestOAuthSignInMethodProof,
  requestPasswordSignInMethodProof,
  unlinkOAuthProvider,
} from './auth/providers';
export type {
  AccountSignInMethod,
  FreshSignInMethodProof,
  SignInMethodAction,
} from './auth/providers';
export type { OAuthProvider } from './auth/types';
export { changePassword, confirmPasswordReset, requestPasswordReset } from './auth/password';
export {
  confirmEmailChange,
  confirmEmailVerification,
  requestEmailChange,
  requestVerification,
} from './auth/email';
export { setupGlobalAuthClear } from './auth/storage';
