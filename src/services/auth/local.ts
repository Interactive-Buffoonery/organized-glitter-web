import { ClientResponseError } from 'pocketbase';
import { pb } from '@/lib/pocketbase';
import type { PocketBaseUser } from '@/contexts/AuthContext';
import { ErrorHandler } from '@/services/pocketbase/base/ErrorHandler';
import type { AuthResult, LoginData, RegisterData } from './types';
import {
  authLogger,
  checkNetworkConnectivity,
  getConnectivityWarning,
  normalizeEmail,
} from './shared';

const emailVerificationRequired = (email: string): AuthResult => ({
  success: false,
  error:
    'Your email address must be verified before you can sign in. Check your inbox and spam folder, or request a new verification email.',
  recovery: {
    type: 'email-verification',
    email,
  },
});

const isEmailVerificationRequired = ({
  record,
  error,
}: {
  record?: { verified?: boolean } | null;
  error?: unknown;
}): boolean => {
  if (record?.verified === false) return true;
  if (!(error instanceof ClientResponseError) || error.status !== 403) return false;
  // The users authRule is `verified = true`; PocketBase reports its rejection generically.
  return (
    error.message === "The request doesn't satisfy the collection requirements to authenticate." ||
    /verif/i.test(error.message)
  );
};

export const loginWithPassword = async (data: LoginData): Promise<AuthResult> => {
  const normalizedEmail = normalizeEmail(data.email);

  authLogger.debug('Starting password login');

  if (!normalizedEmail) {
    return {
      success: false,
      error: 'Please enter your email address.',
    };
  }

  if (!data.password) {
    return {
      success: false,
      error: 'Please enter your password.',
    };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    return {
      success: false,
      error: 'Please enter a valid email address (e.g., name@example.com).',
    };
  }

  const connectivity = await checkNetworkConnectivity();
  const connectivityWarning = getConnectivityWarning(connectivity);

  if (connectivityWarning) {
    authLogger.warn('Proceeding with password login despite a connectivity warning');
  }

  try {
    authLogger.debug('Attempting password authentication');

    const authData = await pb.collection('users').authWithPassword(normalizedEmail, data.password);

    authLogger.debug('Password authentication completed');

    const userRecord = authData.record as PocketBaseUser;

    if (isEmailVerificationRequired({ record: userRecord })) {
      authLogger.warn('Password login requires email verification');
      pb.authStore.clear();
      return emailVerificationRequired(normalizedEmail);
    }

    authLogger.debug('Password login allowed');

    return {
      success: true,
      user: userRecord,
    };
  } catch (error) {
    if (isEmailVerificationRequired({ error })) {
      authLogger.warn('Password login requires email verification');
      pb.authStore.clear();
      return emailVerificationRequired(normalizedEmail);
    }

    authLogger.error('Password authentication failed');

    const handledError = ErrorHandler.handleError(error, 'Password authentication');
    let errorMessage = ErrorHandler.getUserMessage(handledError);

    if (
      !errorMessage ||
      errorMessage === 'An unexpected error occurred' ||
      errorMessage === 'Something went wrong.'
    ) {
      if (error instanceof ClientResponseError) {
        if (error.status === 400) {
          errorMessage = 'The email or password you entered is incorrect. Please try again.';
        } else if (error.status >= 500) {
          errorMessage =
            'The server is temporarily unavailable. Please try again in a few minutes.';
        } else {
          errorMessage = 'Sign in failed. Please check your email and password and try again.';
        }
      } else if (connectivityWarning) {
        errorMessage = 'Connection error. Please check your internet connection and try again.';
      } else {
        errorMessage = 'An unexpected error occurred. Please try again.';
      }
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
};

export const registerWithPassword = async (data: RegisterData): Promise<AuthResult> => {
  const normalizedEmail = normalizeEmail(data.email);

  if (data.password !== data.confirmPassword) {
    return { success: false, error: 'Passwords do not match' };
  }

  try {
    authLogger.debug('Attempting user registration', {
      emailNormalized: data.email !== normalizedEmail,
    });

    const createData = {
      email: normalizedEmail,
      password: data.password,
      passwordConfirm: data.confirmPassword,
      username: data.username,
      beta_tester: true,
    };

    authLogger.debug('Attempting to create user');
    await pb.collection('users').create(createData);
    authLogger.debug('User account created successfully in PocketBase');

    authLogger.debug('Requesting email verification for new user');
    await pb.collection('users').requestVerification(normalizedEmail);
    authLogger.debug('Email verification requested successfully');

    return {
      success: true,
      user: undefined,
    };
  } catch (error) {
    authLogger.error('User registration failed');

    const handledError = ErrorHandler.handleError(error, 'User registration');
    const errorMessage =
      ErrorHandler.getUserMessage(handledError) || 'An unknown error occurred during registration.';

    return {
      success: false,
      error: errorMessage,
    };
  }
};
