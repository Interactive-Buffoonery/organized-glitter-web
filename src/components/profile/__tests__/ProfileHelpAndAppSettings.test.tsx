import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { signOutMock, navigateMock, showUserReportDialogMock, usePWAInstallMock } = vi.hoisted(
  () => ({
    signOutMock: vi.fn(),
    navigateMock: vi.fn(),
    showUserReportDialogMock: vi.fn(),
    usePWAInstallMock: vi.fn(),
  })
);

vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'test@example.com' },
    signOut: signOutMock,
  }),
}));

vi.mock('@/hooks/usePWAInstall', () => ({
  usePWAInstall: () => usePWAInstallMock(),
}));

vi.mock('@/utils/ui/deviceDetection', () => ({
  shouldShowIOSInstallPrompt: () => false,
  isMacOSSafari: () => false,
}));

vi.mock('@/components/FeedbackDialogStore', () => ({
  showUserReportDialog: showUserReportDialogMock,
}));

vi.mock('@/lib/notifications', () => ({
  notify: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

import { ProfileHelpAndAppSettings } from '../ProfileHelpAndAppSettings';

describe('ProfileHelpAndAppSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signOutMock.mockResolvedValue({ success: true });
    usePWAInstallMock.mockReturnValue({
      isInstalled: false,
      promptInstall: vi.fn().mockResolvedValue(undefined),
      isInstallable: false,
    });
  });

  it('renders profile fallback app and session actions', () => {
    render(
      <MemoryRouter>
        <ProfileHelpAndAppSettings currentPage="Profile" />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Help & app' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send feedback' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install Web App' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Crafters Den Dev Cave' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Support Organized Glitter' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'About' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Privacy' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Terms' })).not.toBeInTheDocument();
    // Logout used to live here; now it's in the page header. Asserting its
    // absence keeps us honest if someone re-adds it without intent.
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
  });

  it('hides install when the app is already installed', () => {
    usePWAInstallMock.mockReturnValue({
      isInstalled: true,
      promptInstall: vi.fn(),
      isInstallable: false,
    });

    render(
      <MemoryRouter>
        <ProfileHelpAndAppSettings currentPage="Profile" />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: 'Install Web App' })).not.toBeInTheDocument();
  });

  it('opens feedback from the fallback panel', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ProfileHelpAndAppSettings currentPage="Profile" />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Send feedback' }));

    expect(showUserReportDialogMock).toHaveBeenCalledWith(
      expect.objectContaining({ currentPage: 'Profile' })
    );
  });

  it('offers the support page when tips are configured', () => {
    vi.stubEnv('VITE_STRIPE_TIP_3_URL', 'https://buy.stripe.com/test_3');
    render(
      <MemoryRouter>
        <ProfileHelpAndAppSettings currentPage="Profile" />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Support Organized Glitter' })).toHaveAttribute(
      'href',
      '/support'
    );
    vi.unstubAllEnvs();
  });
});
