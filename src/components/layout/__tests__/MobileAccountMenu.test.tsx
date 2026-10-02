import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const {
  signOutMock,
  navigateMock,
  updateThemePreferenceMock,
  showUserReportDialogMock,
  usePWAInstallMock,
} = vi.hoisted(() => ({
  signOutMock: vi.fn(),
  navigateMock: vi.fn(),
  updateThemePreferenceMock: vi.fn(),
  showUserReportDialogMock: vi.fn(),
  usePWAInstallMock: vi.fn(),
}));

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

vi.mock('@/services/pocketbase/privateFiles.service', () => ({
  PrivateFilesService: {
    getBaseUrl: () => 'https://pb.example',
    getCurrentUserId: () => 'u1',
  },
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: 'system',
    setTheme: vi.fn(),
  }),
}));

vi.mock('@/hooks/mutations/useUpdateThemePreferenceMutation', () => ({
  useUpdateThemePreferenceMutation: () => ({
    mutate: updateThemePreferenceMock,
  }),
}));

import { MobileAccountMenu } from '../MobileAccountMenu';
import type { AvatarConfig } from '@/types/avatar';

const testAvatarConfig: AvatarConfig = { type: 'initials', initials: 'TE', colorIndex: 0 };

describe('MobileAccountMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.setPointerCapture ??= vi.fn();
    Element.prototype.releasePointerCapture ??= vi.fn();
    signOutMock.mockResolvedValue({ success: true });
    usePWAInstallMock.mockReturnValue({
      isInstalled: false,
      promptInstall: vi.fn().mockResolvedValue(undefined),
      isInstallable: false,
    });
  });

  it('opens a touch drawer with account, appearance, app, and session actions', async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, 'error');

    render(
      <MemoryRouter>
        <MobileAccountMenu
          avatarConfig={testAvatarConfig}
          userName="Test User"
          userEmail="test@example.com"
          currentPage="Overview"
        />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Open account menu' }));

    expect(screen.getByRole('heading', { name: 'Account menu' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Account menu' })).toHaveAccessibleDescription(
      'Account, app, help, and session actions.'
    );
    expect(consoleError.mock.calls.flat().join('\n')).not.toContain('requires a `DialogTitle`');
    consoleError.mockRestore();
    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Profile & settings' })).toHaveAttribute(
      'href',
      '/profile'
    );
    expect(screen.getByRole('link', { name: 'Manage Lists' })).toHaveAttribute('href', '/options');
    expect(screen.getByRole('link', { name: 'Stats' })).toHaveAttribute('href', '/stats');
    expect(screen.queryByRole('link', { name: 'Data import/export' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send feedback' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Subscribe to Updates' })).toHaveAttribute(
      'href',
      'https://updates.organizedglitter.app/#subscribe'
    );
    expect(screen.getByRole('button', { name: 'Install Web App' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'About' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Privacy' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Terms' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Crafters Den Dev Cave' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Overview' })).not.toBeInTheDocument();
  });

  it('closes the drawer after an internal route link is selected', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <MobileAccountMenu avatarConfig={testAvatarConfig} currentPage="Overview" />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Open account menu' }));
    fireEvent.click(screen.getByRole('link', { name: 'Profile & settings' }));

    await waitFor(() => {
      expect(document.querySelector('[data-vaul-drawer]')).toHaveAttribute('data-state', 'closed');
    });
  });

  it('hides install when the app is already installed', async () => {
    const user = userEvent.setup();
    usePWAInstallMock.mockReturnValue({
      isInstalled: true,
      promptInstall: vi.fn(),
      isInstallable: false,
    });

    render(
      <MemoryRouter>
        <MobileAccountMenu avatarConfig={testAvatarConfig} currentPage="Overview" />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Open account menu' }));

    expect(screen.queryByRole('button', { name: 'Install Web App' })).not.toBeInTheDocument();
  });

  it('logs out and navigates to login', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <MobileAccountMenu avatarConfig={testAvatarConfig} currentPage="Overview" />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Open account menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true });
    });
  });
});
