import { getCurrentUserId, isAuthenticated } from '@/services/auth';
import { ErrorHandler } from './ErrorHandler';

export function requireUserId(expectedUserId?: string): string {
  if (!isAuthenticated()) throw ErrorHandler.createError('auth', 'User not authenticated', false);
  const userId = getCurrentUserId();
  if (!userId || (expectedUserId && userId !== expectedUserId)) {
    throw ErrorHandler.createError('auth', 'User not authenticated', false);
  }
  return userId;
}
