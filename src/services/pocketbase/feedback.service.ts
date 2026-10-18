import { pb } from '@/lib/pocketbase';
import {
  captureSessionIdentity,
  isCurrentSessionIdentity,
  type SessionIdentity,
} from '@/services/auth/sessionIdentity';
import { reportInvalidSession } from '@/services/auth/sessionRecovery';

interface FeedbackRequest {
  feedback: string;
  email?: string;
  type?: 'general' | 'bug' | 'feature' | 'improvement';
}

export async function sendFeedbackRequest(
  payload: FeedbackRequest,
  token: string,
  sessionIdentity: SessionIdentity = captureSessionIdentity()
): Promise<Response> {
  const response = await fetch(`${pb.baseURL}/api/organized-glitter/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (
    response.status === 401 &&
    pb.authStore.token === token &&
    isCurrentSessionIdentity(sessionIdentity)
  ) {
    reportInvalidSession(token);
  }
  return response;
}
