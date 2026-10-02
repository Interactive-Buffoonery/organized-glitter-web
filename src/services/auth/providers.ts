import PocketBase, { BaseAuthStore, ClientResponseError } from 'pocketbase';
import { pb } from '@/lib/pocketbase';
import type { PocketBaseUser } from '@/contexts/AuthContext';
import type { AuthResult, OAuthProvider } from './types';
import { authLogger } from './shared';
import { getStructuredErrorReason } from '@/utils/error/structuredErrorReason';

const OAUTH_PROVIDERS: readonly OAuthProvider[] = ['apple', 'google', 'discord'];

export const OAUTH_PROVIDER_LABELS: Record<OAuthProvider, string> = {
  apple: 'Apple',
  google: 'Google',
  discord: 'Discord',
};

type ProviderEntry = { name?: unknown };

type AuthMethodsResponse = {
  oauth2?: { providers?: unknown };
  authProviders?: unknown;
};

type ExternalAuthEntry = {
  provider?: unknown;
};

export interface AccountSignInMethod {
  provider: OAuthProvider;
  label: string;
  configured: boolean;
  linked: boolean;
}

export type SignInMethodAction = 'link' | 'unlink';

export interface FreshSignInMethodProof {
  action: SignInMethodAction;
  authToken: string;
  targetProvider: OAuthProvider;
  userId: string;
  value: string;
}

interface OAuthActionResult extends AuthResult {
  conflict?: boolean;
  reason?: 'account_changed' | 'continuity_changed' | 'fresh_proof_required';
}

interface StepUpResult extends OAuthActionResult {
  proof?: FreshSignInMethodProof;
}

function isOAuthProvider(value: unknown): value is OAuthProvider {
  return typeof value === 'string' && OAUTH_PROVIDERS.includes(value as OAuthProvider);
}

function normalizeOAuthProviders(methods: unknown): OAuthProvider[] {
  if (!methods || typeof methods !== 'object') return [];

  const response = methods as AuthMethodsResponse;
  const modernProviders = response.oauth2?.providers;
  const legacyProviders = response.authProviders;
  const entries = Array.isArray(modernProviders)
    ? modernProviders
    : Array.isArray(legacyProviders)
      ? legacyProviders
      : [];

  const configured = new Set<OAuthProvider>();
  for (const entry of entries as ProviderEntry[]) {
    const name = typeof entry?.name === 'string' ? entry.name.toLowerCase() : '';
    if (isOAuthProvider(name)) configured.add(name);
  }

  return OAUTH_PROVIDERS.filter(provider => configured.has(provider));
}

function createProofValue(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function accountStillMatches(proof: FreshSignInMethodProof): boolean {
  return pb.authStore.record?.id === proof.userId && pb.authStore.token === proof.authToken;
}

export async function listConfiguredOAuthProviders(): Promise<OAuthProvider[]> {
  const methods = await pb.collection('users').listAuthMethods();
  return normalizeOAuthProviders(methods);
}

export async function listAccountSignInMethods(userId: string): Promise<AccountSignInMethod[]> {
  const [configuredProviders, externalAuths] = await Promise.all([
    listConfiguredOAuthProviders(),
    pb.collection('users').listExternalAuths(userId),
  ]);

  const configured = new Set(configuredProviders);
  const linked = new Set<OAuthProvider>();
  for (const externalAuth of externalAuths as ExternalAuthEntry[]) {
    const provider =
      typeof externalAuth?.provider === 'string' ? externalAuth.provider.toLowerCase() : '';
    if (isOAuthProvider(provider)) linked.add(provider);
  }

  return OAUTH_PROVIDERS.filter(provider => configured.has(provider) || linked.has(provider)).map(
    provider => ({
      provider,
      label: OAUTH_PROVIDER_LABELS[provider],
      configured: configured.has(provider),
      linked: linked.has(provider),
    })
  );
}

function oauthErrorMessage(
  error: unknown,
  provider: OAuthProvider,
  action: 'sign in' | 'connect'
): string {
  const label = OAUTH_PROVIDER_LABELS[provider];
  const fallback =
    action === 'connect'
      ? `Could not connect ${label}. Please try again.`
      : `${label} sign-in failed. Please try again or use email and password.`;

  const message = error instanceof Error ? error.message.toLowerCase() : '';
  const responseMessage =
    error instanceof ClientResponseError
      ? `${error.message} ${JSON.stringify(error.data)}`.toLowerCase()
      : message;

  if (message.includes('blocked') || message.includes('popup')) {
    return `Please allow popups for this site to ${action} with ${label}.`;
  }

  if (
    message.includes('cancel') ||
    message.includes('closed') ||
    message.includes('manually cancelled')
  ) {
    const actionLabel = action === 'sign in' ? 'sign-in' : 'connection';
    return `${label} ${actionLabel} was cancelled. Please try again when ready.`;
  }

  if (
    responseMessage.includes('missing or invalid provider') ||
    responseMessage.includes('missing or is not enabled') ||
    responseMessage.includes('not configured to allow oauth2')
  ) {
    return `${label} is not available right now. Please use another sign-in method.`;
  }

  if (
    error instanceof ClientResponseError &&
    (error.status === 409 || responseMessage.includes('already linked'))
  ) {
    return `This ${label} account is already linked to another Organized Glitter account.`;
  }

  if (error instanceof ClientResponseError && error.status === 0) {
    return `Unable to connect to ${label}. Please check your internet connection.`;
  }

  return fallback;
}

export async function authenticateWithOAuth2(
  provider: OAuthProvider,
  action: 'sign in' | 'connect' = 'sign in',
  expectedUserId?: string,
  proof?: FreshSignInMethodProof
): Promise<OAuthActionResult> {
  const previousToken = pb.authStore.token;
  const previousRecord = pb.authStore.record;

  try {
    authLogger.debug(`Attempting OAuth2 ${action} with ${provider}`);

    // Keep this call before the first await. PocketBase opens its popup synchronously,
    // which preserves Safari's click gesture.
    const authPromise = pb.collection('users').authWithOAuth2({
      provider,
      ...(proof ? { createData: { og_step_up_proof: proof.value } } : {}),
    });
    const authData = await authPromise;

    if (expectedUserId && authData.record.id !== expectedUserId) {
      pb.authStore.save(previousToken, previousRecord);
      authLogger.warn('OAuth2 account link returned a different user', { provider });
      return {
        success: false,
        conflict: true,
        error: `This ${OAUTH_PROVIDER_LABELS[provider]} account belongs to another Organized Glitter account.`,
      };
    }

    return {
      success: true,
      user: authData.record as PocketBaseUser,
    };
  } catch (error) {
    authLogger.error(`OAuth2 ${action} with ${provider} failed`, {
      status: error instanceof ClientResponseError ? error.status : undefined,
    });
    const reason =
      error instanceof ClientResponseError ? getStructuredErrorReason(error) : undefined;
    if (reason === 'fresh_proof_required') {
      return {
        success: false,
        reason: 'fresh_proof_required',
        error: 'Your verification expired or was already used. Verify your identity again.',
      };
    }
    const conflict = error instanceof ClientResponseError && error.status === 409;
    return {
      success: false,
      ...(conflict ? { conflict: true } : {}),
      error: oauthErrorMessage(error, provider, action),
    };
  }
}

export function connectOAuthProvider(
  provider: OAuthProvider,
  userId: string,
  proof: FreshSignInMethodProof
): Promise<OAuthActionResult> {
  if (
    proof.action !== 'link' ||
    proof.targetProvider !== provider ||
    proof.userId !== userId ||
    !accountStillMatches(proof)
  ) {
    return Promise.resolve({
      success: false,
      reason: 'account_changed',
      error: 'Your signed-in account changed. Verify your identity again.',
    });
  }

  return authenticateWithOAuth2(provider, 'connect', userId, proof);
}

export async function unlinkOAuthProvider(
  provider: OAuthProvider,
  proof: FreshSignInMethodProof
): Promise<OAuthActionResult> {
  if (
    proof.action !== 'unlink' ||
    proof.targetProvider !== provider ||
    !accountStillMatches(proof)
  ) {
    return {
      success: false,
      reason: 'account_changed',
      error: 'Your signed-in account changed. Verify your identity again.',
    };
  }

  try {
    await pb.send(`/api/auth/external-auths/${provider}`, {
      method: 'DELETE',
      body: { proof: proof.value },
    });
    return { success: true };
  } catch (error) {
    const label = OAUTH_PROVIDER_LABELS[provider];
    const reason =
      error instanceof ClientResponseError ? getStructuredErrorReason(error) : undefined;

    if (reason === 'continuity_changed') {
      return {
        success: false,
        reason: 'continuity_changed',
        error:
          'Your sign-in methods changed. Verify with your password or another connected provider.',
      };
    }

    if (reason === 'fresh_proof_required') {
      return {
        success: false,
        reason: 'fresh_proof_required',
        error: 'Your verification expired or was already used. Verify your identity again.',
      };
    }

    if (error instanceof ClientResponseError && error.status === 404) {
      return {
        success: false,
        error: `${label} is not linked to this account. Refresh the page and try again.`,
      };
    }

    if (error instanceof ClientResponseError && error.status === 0) {
      return {
        success: false,
        error: 'Unable to update sign-in methods. Please check your internet connection.',
      };
    }

    return {
      success: false,
      error: `Could not unlink ${label}. Please try again.`,
    };
  }
}

export async function requestPasswordSignInMethodProof(
  password: string,
  action: SignInMethodAction,
  targetProvider: OAuthProvider,
  userId: string
): Promise<StepUpResult> {
  const value = createProofValue();
  const authToken = pb.authStore.token;
  if (!authToken || pb.authStore.record?.id !== userId) {
    return {
      success: false,
      reason: 'account_changed',
      error: 'Your signed-in account changed. Sign in again before updating sign-in methods.',
    };
  }

  try {
    await pb.send('/api/auth/step-up/password', {
      method: 'POST',
      body: { action, password, proof: value, targetProvider },
    });
    return {
      success: true,
      proof: { action, authToken, targetProvider, userId, value },
    };
  } catch (error) {
    if (error instanceof ClientResponseError && error.status === 429) {
      return {
        success: false,
        error: 'Too many verification attempts. Try again in 10 minutes.',
      };
    }
    if (
      error instanceof ClientResponseError &&
      (getStructuredErrorReason(error) === 'password_invalid' || error.status === 400)
    ) {
      return { success: false, error: 'The current password is incorrect.' };
    }
    return { success: false, error: 'Could not verify your password. Please try again.' };
  }
}

export async function requestOAuthSignInMethodProof(
  verificationProvider: OAuthProvider,
  action: SignInMethodAction,
  targetProvider: OAuthProvider,
  userId: string
): Promise<StepUpResult> {
  const value = createProofValue();
  const authToken = pb.authStore.token;
  if (!authToken || pb.authStore.record?.id !== userId) {
    return {
      success: false,
      reason: 'account_changed',
      error: 'Your signed-in account changed. Sign in again before updating sign-in methods.',
    };
  }

  const verificationClient = new PocketBase(pb.baseURL, new BaseAuthStore());
  try {
    // Keep this call before the first await so Safari treats it as part of the button click.
    const authPromise = verificationClient.collection('users').authWithOAuth2({
      provider: verificationProvider,
      createData: {
        og_step_up_action: action,
        og_step_up_proof: value,
        og_step_up_target_provider: targetProvider,
        og_step_up_user_id: userId,
      },
    });
    const authData = await authPromise;
    if (authData.record.id !== userId || pb.authStore.token !== authToken) {
      return {
        success: false,
        reason: 'account_changed',
        error: 'That sign-in method does not belong to your current account.',
      };
    }
    return {
      success: true,
      proof: { action, authToken, targetProvider, userId, value },
    };
  } catch (error) {
    return {
      success: false,
      error: oauthErrorMessage(error, verificationProvider, 'sign in'),
    };
  } finally {
    verificationClient.authStore.clear();
  }
}
