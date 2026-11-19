import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate, type NavigateFunction } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  user: { id: 'user-1', coloring_walkthrough_seen: true } as Record<string, unknown> | null,
  contactEmail: 'help@example.com',
  showUserReportDialog: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: state.user,
    isAuthenticated: !!state.user,
    initialCheckComplete: true,
  }),
}));
vi.mock('@/lib/contactConfig', () => ({
  getContactEmail: () => state.contactEmail,
  getSupportMailto: () => (state.contactEmail ? `mailto:${state.contactEmail}` : null),
}));
vi.mock('@/components/FeedbackDialogStore', () => ({
  showUserReportDialog: state.showUserReportDialog,
}));

import { WhatsNewGate } from '../WhatsNewGate';

const renderAt = (path = '/overview') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <WhatsNewGate />
    </MemoryRouter>
  );

describe('WhatsNewGate', () => {
  beforeEach(() => {
    localStorage.clear();
    state.user = { id: 'user-1', coloring_walkthrough_seen: true };
    state.contactEmail = 'help@example.com';
    state.showUserReportDialog.mockClear();
  });

  it('shows once per account until dismissed', async () => {
    const { unmount } = renderAt();
    expect(screen.getByRole('dialog', { name: "What's new" })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'help@example.com' })).toHaveAttribute(
      'href',
      'mailto:help@example.com'
    );

    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    unmount();

    renderAt();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    state.user = { id: 'user-2', coloring_walkthrough_seen: true };
    renderAt();
    expect(screen.getByRole('dialog', { name: "What's new" })).toBeInTheDocument();
  });

  it('opens the feedback form from the dialog', async () => {
    renderAt('/dashboard');
    await userEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(state.showUserReportDialog).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('leaves out the email line when no contact email is configured', () => {
    state.contactEmail = '';
    renderAt();
    expect(screen.getByRole('dialog', { name: "What's new" })).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('waits for new accounts to finish the welcome walkthrough', () => {
    state.user = { id: 'user-1', coloring_walkthrough_seen: false };
    renderAt();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('stays hidden in automated browsers', () => {
    Object.defineProperty(navigator, 'webdriver', { configurable: true, get: () => true });
    try {
      renderAt();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(navigator, 'webdriver');
    }
  });

  it('stays hidden away from the home pages and when signed out', () => {
    renderAt('/projects');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    state.user = null;
    renderAt();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes when the page changes away from the home pages', () => {
    let navigate: NavigateFunction = () => {};
    const CaptureNavigate = () => {
      navigate = useNavigate();
      return null;
    };
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <CaptureNavigate />
        <WhatsNewGate />
      </MemoryRouter>
    );
    expect(screen.getByRole('dialog', { name: "What's new" })).toBeInTheDocument();

    act(() => {
      void navigate('/projects');
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
