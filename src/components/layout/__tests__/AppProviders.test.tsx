import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { setupAutomaticCacheCleaningMock, themeProviderMock } = vi.hoisted(() => ({
  setupAutomaticCacheCleaningMock: vi.fn(() => vi.fn()),
  themeProviderMock: vi.fn(
    ({
      children,
    }: {
      children: React.ReactNode;
      defaultTheme?: string;
      enableSystem?: boolean;
    }) => <>{children}</>
  ),
}));

vi.mock('next-themes', () => ({
  ThemeProvider: themeProviderMock,
  useTheme: () => ({
    theme: 'system',
    setTheme: vi.fn(),
    resolvedTheme: 'light',
  }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, isLoading: false }),
}));

vi.mock('@/hooks/queries/useUserProfileQuery', () => ({
  useUserProfileQuery: () => ({ data: undefined }),
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => <div data-testid="app-toaster" />,
}));

vi.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/contexts/MetadataContext', () => ({
  MetadataProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/FeedbackDialogProvider', () => ({
  default: () => <div data-testid="feedback-dialog-provider" />,
}));

vi.mock('@/components/AnalyticsProvider', () => ({
  AnalyticsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/utils/query/cacheValidation', () => ({
  setupAutomaticCacheCleaning: setupAutomaticCacheCleaningMock,
}));

import { AppProviders } from '../AppProviders';

describe('AppProviders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children and mounts the shared toaster', () => {
    render(
      <AppProviders>
        <div data-testid="app-child">Child content</div>
      </AppProviders>
    );

    expect(screen.getByTestId('app-child')).toBeInTheDocument();
    expect(screen.getByTestId('app-toaster')).toBeInTheDocument();
    expect(screen.getByTestId('feedback-dialog-provider')).toBeInTheDocument();
  });

  it('defaults visitors to System while keeping Light and Dark available', () => {
    render(
      <AppProviders>
        <div>Child content</div>
      </AppProviders>
    );
    expect(themeProviderMock.mock.calls.at(-1)?.[0]).toMatchObject({
      defaultTheme: 'system',
      enableSystem: true,
    });
  });

  it('sets up automatic cache cleaning on mount', () => {
    render(
      <AppProviders>
        <div>Child content</div>
      </AppProviders>
    );

    expect(setupAutomaticCacheCleaningMock).toHaveBeenCalledTimes(1);
  });

  it('keeps current children across provider rerenders', () => {
    render(
      <AppProviders>
        <div>Child content</div>
      </AppProviders>
    );
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });
});
