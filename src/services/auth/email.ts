import { ClientResponseError } from 'pocketbase';
import { pb } from '@/lib/pocketbase';
import { ErrorHandler } from '@/services/pocketbase/base/ErrorHandler';
import type { AuthResult } from './types';
import { authLogger, normalizeEmail } from './shared';

export const confirmEmailVerification = async (token: string): Promise<AuthResult> => {
  try {
    authLogger.debug('Confirming email verification');

    await pb.collection('users').confirmVerification(token);

    authLogger.debug('Email verification confirmed');

    return {
      success: true,
    };
  } catch (error) {
    authLogger.error('Email verification confirmation failed:', error);

    const handledError = ErrorHandler.handleError(error, 'Email verification confirmation');
    let errorMessage = ErrorHandler.getUserMessage(handledError) || 'Failed to verify email';

    if (error instanceof ClientResponseError && error.data) {
      const msg = error.data.message?.toLowerCase() || '';
      if (msg.includes('token') || msg.includes('expired')) {
        errorMessage =
          'Verification link has expired or is invalid. Please request a new verification email.';
      }
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
};

export const requestEmailChange = async (newEmail: string): Promise<AuthResult> => {
  const normalizedEmail = normalizeEmail(newEmail);

  try {
    authLogger.debug('Requesting email change');
    await pb.collection('users').requestEmailChange(normalizedEmail);
    return { success: true };
  } catch (error) {
    authLogger.error('Email change request failed:', error);
    const handledError = ErrorHandler.handleError(error, 'Email change request');
    return {
      success: false,
      error: ErrorHandler.getUserMessage(handledError) || 'Failed to request email change',
    };
  }
};

export const confirmEmailChange = async (token: string, password: string): Promise<AuthResult> => {
  try {
    authLogger.debug('Confirming email change');
    await pb.collection('users').confirmEmailChange(token, password);
    return { success: true };
  } catch (error) {
    authLogger.error('Email change confirmation failed:', error);
    const handledError = ErrorHandler.handleError(error, 'Email change confirmation');
    return {
      success: false,
      error: ErrorHandler.getUserMessage(handledError) || 'Failed to confirm email change',
    };
  }
};

export const requestVerification = async (email: string): Promise<AuthResult> => {
  const normalizedEmail = normalizeEmail(email);

  try {
    authLogger.debug('Requesting email verification');
    await pb.collection('users').requestVerification(normalizedEmail);
    return { success: true };
  } catch (error) {
    authLogger.error('Verification request failed:', error);
    const handledError = ErrorHandler.handleError(error, 'Verification request');
    return {
      success: false,
      error: ErrorHandler.getUserMessage(handledError) || 'Failed to send verification email',
    };
  }
};
