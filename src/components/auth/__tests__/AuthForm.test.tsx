import { describe, it, expect, vi, beforeEach } from '@/test-utils';
import { renderWithProviders, screen, waitFor, userEvent } from '@/test-utils';
import { Route, Routes, useLocation } from 'react-router-dom';
import AuthForm from '../AuthForm';

describe('AuthForm', () => {
  const mockOnSubmit = vi.fn();
  const authRedirectState = {
    from: {
      pathname: '/dashboard',
      search: '?status=wishlist',
      hash: '',
    },
  };

  const LocationStateReader = () => {
    const location = useLocation();
    return <pre data-testid="location-state">{JSON.stringify(location.state ?? null)}</pre>;
  };

  beforeEach(() => {
    mockOnSubmit.mockClear();
  });

  describe('Login Form', () => {
    it('identifies the login password as an existing credential', () => {
      renderWithProviders(<AuthForm type="login" onSubmit={mockOnSubmit} loading={false} />);

      expect(screen.getByLabelText(/^password$/i)).toHaveAttribute(
        'autocomplete',
        'current-password'
      );
    });

    it('renders email and password fields with submit button', () => {
      renderWithProviders(<AuthForm type="login" onSubmit={mockOnSubmit} loading={false} />);

      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('does not render username or confirm password fields', () => {
      renderWithProviders(<AuthForm type="login" onSubmit={mockOnSubmit} loading={false} />);

      expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/confirm password/i)).not.toBeInTheDocument();
    });

    it('validates email format on submit', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AuthForm type="login" onSubmit={mockOnSubmit} loading={false} />);

      await user.type(screen.getByLabelText(/email/i), 'invalid-email');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByText(/valid email is required/i)).toBeInTheDocument();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('validates password minimum length', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AuthForm type="login" onSubmit={mockOnSubmit} loading={false} />);

      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password$/i), '12345');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByText(/password must be at least 6 characters/i)).toBeInTheDocument();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('submits valid login form', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AuthForm type="login" onSubmit={mockOnSubmit} loading={false} />);

      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'password123',
        });
      });
    });

    it('shows forgot password and sign up links', () => {
      renderWithProviders(<AuthForm type="login" onSubmit={mockOnSubmit} loading={false} />);

      expect(screen.getByText(/forgot password/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /sign up/i })).toHaveAttribute('href', '/register');
    });

    it('preserves redirect state when navigating to register', async () => {
      const user = userEvent.setup();

      renderWithProviders(
        <Routes>
          <Route
            path="/login"
            element={
              <AuthForm
                type="login"
                onSubmit={mockOnSubmit}
                loading={false}
                authRedirectState={authRedirectState}
              />
            }
          />
          <Route path="/register" element={<LocationStateReader />} />
        </Routes>,
        { initialRoute: '/login' }
      );

      await user.click(screen.getByRole('link', { name: /sign up/i }));

      await waitFor(() => {
        expect(screen.getByTestId('location-state')).toHaveTextContent('status=wishlist');
      });
    });
  });

  describe('Register Form', () => {
    it('identifies both registration passwords as new credentials', () => {
      renderWithProviders(<AuthForm type="register" onSubmit={mockOnSubmit} loading={false} />);

      expect(screen.getByLabelText(/^password$/i)).toHaveAttribute('autocomplete', 'new-password');
      expect(screen.getByLabelText(/confirm password/i)).toHaveAttribute(
        'autocomplete',
        'new-password'
      );
    });

    it('renders all registration fields', () => {
      renderWithProviders(<AuthForm type="register" onSubmit={mockOnSubmit} loading={false} />);

      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    });

    it('validates username minimum length', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AuthForm type="register" onSubmit={mockOnSubmit} loading={false} />);

      await user.type(screen.getByLabelText(/username/i), 'ab');
      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.type(screen.getByLabelText(/confirm password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText(/username must be at least 3 characters/i)).toBeInTheDocument();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('validates password mismatch', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AuthForm type="register" onSubmit={mockOnSubmit} loading={false} />);

      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.type(screen.getByLabelText(/username/i), 'testuser');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.type(screen.getByLabelText(/confirm password/i), 'different456');
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText(/passwords don't match/i)).toBeInTheDocument();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('shows sign in link', () => {
      renderWithProviders(<AuthForm type="register" onSubmit={mockOnSubmit} loading={false} />);

      expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
    });

    it('preserves redirect state when navigating back to login', async () => {
      const user = userEvent.setup();

      renderWithProviders(
        <Routes>
          <Route
            path="/register"
            element={
              <AuthForm
                type="register"
                onSubmit={mockOnSubmit}
                loading={false}
                authRedirectState={authRedirectState}
              />
            }
          />
          <Route path="/login" element={<LocationStateReader />} />
        </Routes>,
        { initialRoute: '/register' }
      );

      await user.click(screen.getByRole('link', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByTestId('location-state')).toHaveTextContent('status=wishlist');
      });
    });
  });

  describe('Loading state', () => {
    it('disables submit button and shows loading text', () => {
      renderWithProviders(<AuthForm type="login" onSubmit={mockOnSubmit} loading={true} />);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(screen.getByText(/please wait/i)).toBeInTheDocument();
    });

    it('disables input fields while loading', () => {
      renderWithProviders(<AuthForm type="login" onSubmit={mockOnSubmit} loading={true} />);

      expect(screen.getByLabelText(/email/i)).toBeDisabled();
      expect(screen.getByLabelText(/^password$/i)).toBeDisabled();
    });
  });

  describe('Error display', () => {
    it('shows error message with alert role', () => {
      renderWithProviders(
        <AuthForm
          type="login"
          onSubmit={mockOnSubmit}
          loading={false}
          error="Invalid credentials"
        />
      );

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });

    it('shows verification help for an email verification recovery', () => {
      renderWithProviders(
        <AuthForm
          type="login"
          onSubmit={mockOnSubmit}
          loading={false}
          error="Your email address must be verified before you can sign in."
          verificationEmail="test@example.com"
        />
      );

      expect(screen.getByText(/check your spam folder/i)).toBeInTheDocument();
    });

    it('opens email confirmation with the entered email and redirect state', async () => {
      const user = userEvent.setup();

      renderWithProviders(
        <Routes>
          <Route
            path="/login"
            element={
              <AuthForm
                type="login"
                onSubmit={mockOnSubmit}
                loading={false}
                error="Your email address must be verified before you can sign in."
                verificationEmail="test@example.com"
                authRedirectState={authRedirectState}
              />
            }
          />
          <Route path="/email-confirmation" element={<LocationStateReader />} />
        </Routes>,
        { initialRoute: '/login' }
      );

      await user.click(screen.getByRole('link', { name: /request a new verification email/i }));

      await waitFor(() => {
        expect(screen.getByTestId('location-state')).toHaveTextContent('test@example.com');
        expect(screen.getByTestId('location-state')).toHaveTextContent('status=wishlist');
      });
    });

    it('shows reset link for password-related errors', () => {
      renderWithProviders(
        <AuthForm type="login" onSubmit={mockOnSubmit} loading={false} error="Incorrect password" />
      );

      expect(screen.getByText(/reset it here/i)).toBeInTheDocument();
    });

    it('shows connection help text for network errors', () => {
      renderWithProviders(
        <AuthForm type="login" onSubmit={mockOnSubmit} loading={false} error="Connection failed" />
      );

      expect(screen.getByText(/check your internet connection/i)).toBeInTheDocument();
    });

    it('does not show error when none provided', () => {
      renderWithProviders(<AuthForm type="login" onSubmit={mockOnSubmit} loading={false} />);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
