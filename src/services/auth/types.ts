import type { PocketBaseUser } from '@/contexts/AuthContext';

export interface LoginData {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  confirmPassword: string;
  username: string;
}

export interface AuthResult {
  success: boolean;
  user?: PocketBaseUser;
  error?: string;
  reason?: string;
  recovery?: {
    type: 'email-verification';
    email: string;
  };
}

export type OAuthProvider = 'apple' | 'google' | 'discord';
