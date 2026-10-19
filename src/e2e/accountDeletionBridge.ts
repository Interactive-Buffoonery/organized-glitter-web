import { POCKETBASE_URL } from '@/lib/pocketbaseConfig';
import { deletionIntents } from '@/services/accountDeletion/intentStore';
import { armDeletionTransportFence } from '@/services/accountDeletion/analytics';
import { loginWithPassword } from '@/services/auth/local';

const localHost = (value: string): boolean => {
  try {
    return ['localhost', '127.0.0.1'].includes(new URL(value).hostname);
  } catch {
    return false;
  }
};

export const installAccountDeletionBridge = (): void => {
  if (__APP_TEST_ENV__ !== 'test' || !localHost(window.location.href) || !localHost(POCKETBASE_URL))
    return;
  window.__ogDeletionQa = Object.freeze({
    deletionIntents,
    armDeletionTransportFence,
    loginWithPassword,
  });
};

declare global {
  interface Window {
    __ogDeletionQa?: Readonly<{
      deletionIntents: typeof deletionIntents;
      armDeletionTransportFence: typeof armDeletionTransportFence;
      loginWithPassword: typeof loginWithPassword;
    }>;
  }
}
