import { pb } from '@/lib/pocketbase';
import { getSessionIdentityTracker, type SessionIdentity } from './sessionEpoch';

export {
  createSessionIdentityTracker,
  type SessionIdentity,
  type SessionIdentityTracker,
} from './sessionEpoch';

const sessionIdentityTracker = getSessionIdentityTracker(pb.authStore);

export function captureSessionIdentity(): SessionIdentity {
  return sessionIdentityTracker.capture();
}

export function isCurrentSessionIdentity(identity: SessionIdentity): boolean {
  return sessionIdentityTracker.isCurrent(identity);
}
