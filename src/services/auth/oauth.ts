import { pb } from '@/lib/pocketbase';
import type { PocketBaseUser } from '@/contexts/AuthContext';
import type { AuthResult, OAuthProvider } from './types';
import { authLogger } from './shared';
import { authenticateWithOAuth2 } from './providers';

const ensureBetaTester = async (user: PocketBaseUser): Promise<PocketBaseUser> => {
  if (user && (user.beta_tester === undefined || user.beta_tester === false)) {
    try {
      authLogger.debug('Setting default beta_tester value for OAuth2 user', { userId: user.id });
      const updatedUser = await pb.collection('users').update(user.id, { beta_tester: true });
      return updatedUser as PocketBaseUser;
    } catch (updateError) {
      authLogger.warn('Failed to update beta_tester field for OAuth2 user:', {
        userId: user.id,
        error: updateError,
      });
    }
  }
  return user;
};

export const loginWithOAuth2 = async (provider: OAuthProvider): Promise<AuthResult> => {
  const result = await authenticateWithOAuth2(provider);
  if (!result.success || !result.user) return result;

  const user = await ensureBetaTester(result.user);
  return { success: true, user };
};
