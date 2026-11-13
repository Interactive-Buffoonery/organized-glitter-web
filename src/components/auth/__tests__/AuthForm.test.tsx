import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import AuthForm from '../AuthForm';

const setup = (type: 'login' | 'register') => {
  const onSubmit = vi.fn();
  render(
    <MemoryRouter>
      <AuthForm type={type} onSubmit={onSubmit} loading={false} />
    </MemoryRouter>
  );
  return { user: userEvent.setup(), onSubmit };
};

describe('AuthForm validation with React Hook Form', () => {
  it('submits all registration fields through the real resolver', async () => {
    const { user, onSubmit } = setup('register');
    await user.type(screen.getByLabelText('Email'), 'new-user@example.com');
    await user.type(screen.getByLabelText('Username'), 'new_user-1');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'example-password');
    await user.type(screen.getByLabelText('Confirm Password'), 'example-password');
    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      email: 'new-user@example.com',
      username: 'new_user-1',
      password: 'example-password',
      confirmPassword: 'example-password',
    });
  });

  it('blocks invalid registration and accepts corrected values', async () => {
    const { user, onSubmit } = setup('register');
    await user.type(screen.getByLabelText('Email'), 'invalid');
    await user.type(screen.getByLabelText('Username'), 'bad name');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'example-password');
    await user.type(screen.getByLabelText('Confirm Password'), 'different-password');
    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(await screen.findByText('Valid email is required')).toBeVisible();
    expect(
      screen.getByText('Username can only contain letters, numbers, hyphens, and underscores')
    ).toBeVisible();
    expect(screen.getByText("Passwords don't match")).toBeVisible();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(onSubmit).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'corrected@example.com');
    await user.clear(screen.getByLabelText('Username'));
    await user.type(screen.getByLabelText('Username'), 'corrected_user');
    await user.clear(screen.getByLabelText('Confirm Password'));
    await user.type(screen.getByLabelText('Confirm Password'), 'example-password');
    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      email: 'corrected@example.com',
      username: 'corrected_user',
      password: 'example-password',
      confirmPassword: 'example-password',
    });
    expect(screen.queryByText("Passwords don't match")).not.toBeInTheDocument();
  });

  it('blocks malformed email and short passwords at login', async () => {
    const { user, onSubmit } = setup('login');
    await user.type(screen.getByLabelText('Email'), 'invalid');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'short');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(await screen.findByText('Valid email is required')).toBeVisible();
    expect(screen.getByText('Password must be at least 6 characters')).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
