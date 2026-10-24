import { POCKETBASE_URL } from '@/lib/pocketbaseConfig';
import { deletionIntents } from '@/services/accountDeletion/intentStore';
import {
  armDeletionTransportFence,
  discardDeletionAnalyticsQueues,
  recordCompletedDeletionTransportFence,
  releaseDeletionTransportFence,
  resumeDeletionAnalytics,
  suspendDeletionAnalytics,
} from '@/services/accountDeletion/analytics';
import { loginWithPassword } from '@/services/auth/local';
import posthog from 'posthog-js';

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
    discardDeletionAnalyticsQueues,
    recordCompletedDeletionTransportFence,
    releaseDeletionTransportFence,
    resumeDeletionAnalytics,
    suspendDeletionAnalytics,
    loginWithPassword,
    posthog,
  });
};

declare global {
  interface Window {
    __ogDeletionQa?: Readonly<{
      deletionIntents: typeof deletionIntents;
      armDeletionTransportFence: typeof armDeletionTransportFence;
      discardDeletionAnalyticsQueues: typeof discardDeletionAnalyticsQueues;
      recordCompletedDeletionTransportFence: typeof recordCompletedDeletionTransportFence;
      releaseDeletionTransportFence: typeof releaseDeletionTransportFence;
      resumeDeletionAnalytics: typeof resumeDeletionAnalytics;
      suspendDeletionAnalytics: typeof suspendDeletionAnalytics;
      loginWithPassword: typeof loginWithPassword;
      posthog: typeof posthog;
    }>;
  }
}
