import { pb } from '@/lib/pocketbase';
import { ErrorHandler } from '@/services/pocketbase/base/ErrorHandler';
import type { AuthResult } from './types';
import { authLogger, normalizeEmail } from './shared';
import { getCurrentUserId } from './state';
import { getStructuredErrorReason } from '@/utils/error/structuredErrorReason';

const getStructuredPasswordErrorMessage = (reason: string): string => {
  switch (reason) {
    case 'session_required':
      return 'Your session expired. Please sign in again.';
    case 'rate_limited':
      return 'Too many attempts. Please try again later.';
    default:
      return 'Failed to change password. Please try again.';
  }
};

export const requestPasswordReset = async (email: string): Promise<AuthResult> => {
  const normalizedEmail = normalizeEmail(email);

  try {
    authLogger.debug('Requesting password reset');

    await pb.collection('users').requestPasswordReset(normalizedEmail);

    authLogger.debug('Password reset email sent');

    return {
      success: true,
    };
  } catch (error) {
    authLogger.error('Password reset request failed:', error);

    const handledError = ErrorHandler.handleError(error, 'Password reset request');
    const errorMessage =
      ErrorHandler.getUserMessage(handledError) || 'Failed to send password reset email';

    return {
      success: false,
      error: errorMessage,
    };
  }
};

export const confirmPasswordReset = async (
  token: string,
  password: string,
  passwordConfirm: string
): Promise<AuthResult> => {
  try {
    authLogger.debug('Confirming password reset');

    await pb.collection('users').confirmPasswordReset(token, password, passwordConfirm);

    authLogger.debug('Password reset confirmed');

    return {
      success: true,
    };
  } catch (error) {
    authLogger.error('Password reset confirmation failed:', error);

    const handledError = ErrorHandler.handleError(error, 'Password reset confirmation');
    const errorMessage = ErrorHandler.getUserMessage(handledError) || 'Failed to reset password';

    return {
      success: false,
      error: errorMessage,
    };
  }
};

export const changePassword = async (
  oldPassword: string,
  newPassword: string,
  newPasswordConfirm: string
): Promise<AuthResult> => {
  const userId = getCurrentUserId();
  if (!userId) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    authLogger.debug('Changing password');
    await pb.collection('users').update(userId, {
      oldPassword,
      password: newPassword,
      passwordConfirm: newPasswordConfirm,
    });
    return { success: true };
  } catch (error) {
    authLogger.error('Password change failed:', error);
    const handledError = ErrorHandler.handleError(error, 'Password change');
    const reason = getStructuredErrorReason(error);
    return {
      success: false,
      error: reason
        ? getStructuredPasswordErrorMessage(reason)
        : ErrorHandler.getUserMessage(handledError) || 'Failed to change password',
      ...(reason ? { reason } : {}),
    };
  }
};
