import React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { AuthRedirectState } from '@/utils/auth/redirects';

// Define schema based on type
const loginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const registerSchema = z
  .object({
    email: z.string().email('Valid email is required'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(6, 'Please confirm your password'),
    username: z
      .string()
      .min(3, 'Username must be at least 3 characters')
      .max(20, 'Username must be less than 20 characters')
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        'Username can only contain letters, numbers, hyphens, and underscores'
      ),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

interface AuthFormProps {
  type: 'login' | 'register';
  onSubmit: (data: LoginFormValues | RegisterFormValues) => void;
  loading: boolean;
  error?: string;
  verificationEmail?: string;
  authRedirectState?: AuthRedirectState;
}

const AuthForm: React.FC<AuthFormProps> = ({
  type,
  onSubmit,
  loading,
  error,
  verificationEmail,
  authRedirectState,
}) => {
  // Determine which schema to use
  const schema = type === 'login' ? loginSchema : registerSchema;

  // Set up the form with proper default values based on type
  const form = useForm<LoginFormValues | RegisterFormValues>({
    resolver: zodResolver(schema),
    defaultValues:
      type === 'login'
        ? {
            email: '',
            password: '',
          }
        : {
            email: '',
            password: '',
            confirmPassword: '',
            username: '',
          },
  });

  // Handle form submission
  const handleSubmit = (data: LoginFormValues | RegisterFormValues) => {
    onSubmit(data);
  };

  return (
    <Form {...form}>
      {/* noValidate: defer entirely to React Hook Form + Zod so HTML5 validation
          from type="email" doesn't intercept submit and block the Zod error from
          rendering. Zod is the single source of validation truth for this form. */}
      <form noValidate onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground/90 font-medium">Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  inputMode="email"
                  placeholder="your.email@example.com"
                  {...field}
                  value={field.value || ''}
                  autoComplete={type === 'login' ? 'username' : 'email'}
                  disabled={loading}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {type === 'register' && (
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-foreground/90 font-medium">Username</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Choose a username"
                    {...field}
                    value={field.value || ''}
                    autoComplete="username"
                    disabled={loading}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground/90 font-medium">Password</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="••••••••"
                  {...field}
                  value={field.value || ''}
                  autoComplete={type === 'login' ? 'current-password' : 'new-password'}
                  disabled={loading}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {type === 'register' && (
          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-foreground/90 font-medium">Confirm Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    {...field}
                    value={field.value || ''}
                    autoComplete="new-password"
                    disabled={loading}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {error && (
          <div
            className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm backdrop-blur-sm"
            role="alert"
            aria-live="polite"
          >
            <div className="flex items-start gap-3">
              <svg
                className="mt-0.5 size-5 flex-shrink-0 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="flex-1">
                <p className="font-medium text-red-600">{error}</p>
                {verificationEmail && type === 'login' && (
                  <p className="mt-2 text-xs text-red-500/80">
                    Didn't receive the email? Check your spam folder or{' '}
                    <Link
                      to="/email-confirmation"
                      state={{ email: verificationEmail, ...authRedirectState }}
                      className="underline hover:text-red-600"
                    >
                      request a new verification email
                    </Link>
                  </p>
                )}
                {(error.toLowerCase().includes('incorrect') ||
                  error.toLowerCase().includes('password')) &&
                  type === 'login' &&
                  !verificationEmail && (
                    <p className="mt-2 text-xs text-red-500/80">
                      Forgot your password?{' '}
                      <Link to="/forgot-password" className="underline hover:text-red-600">
                        Reset it here
                      </Link>
                    </p>
                  )}
                {(error.toLowerCase().includes('connection') ||
                  error.toLowerCase().includes('offline') ||
                  error.toLowerCase().includes('network')) && (
                  <p className="mt-2 text-xs text-red-500/80">
                    Please check your internet connection and try again.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <Button
          type="submit"
          className="w-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={loading}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <div className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
              Please wait…
            </span>
          ) : type === 'login' ? (
            'Sign In'
          ) : (
            'Create Account'
          )}
        </Button>

        {type === 'login' ? (
          <div className="space-y-1 text-center text-sm">
            <Link
              to="/forgot-password"
              className="text-link hover:text-link/80 transition-colors duration-200 hover:underline"
            >
              Forgot password?
            </Link>
            <div>
              Don't have an account?{' '}
              <Link
                to="/register"
                state={authRedirectState}
                className="text-link hover:text-link/80 font-medium transition-colors duration-200 hover:underline"
              >
                Sign up
              </Link>
            </div>
          </div>
        ) : (
          <div className="text-center text-sm">
            Already have an account?{' '}
            <Link
              to="/login"
              state={authRedirectState}
              className="text-link hover:text-link/80 font-medium transition-colors duration-200 hover:underline"
            >
              Sign in
            </Link>
          </div>
        )}
      </form>
    </Form>
  );
};

export default AuthForm;
