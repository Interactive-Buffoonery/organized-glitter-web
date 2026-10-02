import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { signOutMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(),
}));

vi.mock('@/constants/updates', () => ({
  UPDATES_URL: 'https://site.example.test/updates/',
  SUBSCRIBE_TO_UPDATES_URL: 'https://site.example.test/updates/#subscribe',
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'test@example.com' },
    signOut: signOutMock,
  }),
}));

vi.mock('@/hooks/usePWAInstall', () => ({
  usePWAInstall: () => ({
    isInstalled: true,
    promptInstall: vi.fn(),
    isInstallable: false,
  }),
}));

vi.mock('@/utils/ui/deviceDetection', () => ({
  shouldShowIOSInstallPrompt: () => false,
  isMacOSSafari: () => false,
}));

vi.mock('@/components/FeedbackDialogStore', () => ({
  showUserReportDialog: vi.fn(),
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

import { AuthMenu } from '../AuthMenu';
import type { AvatarConfig } from '@/types/avatar';

const testAvatarConfig: AvatarConfig = { type: 'initials', initials: 'TE', colorIndex: 0 };

describe('AuthMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders avatar trigger with user identity in dropdown', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthMenu
          avatarConfig={testAvatarConfig}
          userName="Test User"
          userEmail="test@example.com"
          currentPage="Dashboard"
        />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: /account menu/i }));

    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Subscribe to Updates' })).toHaveAttribute(
      'href',
      'https://site.example.test/updates/#subscribe'
    );
    expect(screen.queryByText('Navigation')).not.toBeInTheDocument();
    expect(screen.getByText('Logout')).toBeInTheDocument();
  });
});
