/**
 * ProjectRandomizer route-mount smoke test.
 *
 * Mounts /randomizer with the real RandomizerWheel + target selector +
 * SpinHistory subtree and asserts no render-loop errors. The randomizer is a
 * dense Tailwind 4 / Radix surface: breadcrumbs, accordion, cards, plus the
 * wheel's custom `lg:w-105` / `xl:w-140` utilities (the plan's single biggest
 * Tailwind 4 concern). A toolchain regression to any of those would show up
 * here as a mount crash or boundary fallback.
 */

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, waitFor } from '../../test-utils';
import {
  installRenderLoopGuard,
  assertNoRenderLoop,
  ERROR_BOUNDARY_FALLBACK_PATTERNS,
} from '../../test-utils/renderLoopGuard';

const guard = installRenderLoopGuard();

const { notifyMock, authState, randomizerState, baseTargets } = vi.hoisted(() => {
  const baseTargets = [
    {
      id: 'p-1',
      mode: 'diamond' as const,
      targetType: 'diamond_project' as const,
      title: 'Aurora Wolves',
      subtitle: 'Diamond painting',
      href: '/projects/p-1',
      statusLabel: 'In progress',
      imageUrl: undefined,
      selectedMetadata: {},
    },
    {
      id: 'p-2',
      mode: 'diamond' as const,
      targetType: 'diamond_project' as const,
      title: 'Starlit Garden',
      subtitle: 'Diamond painting',
      href: '/projects/p-2',
      statusLabel: 'In progress',
      imageUrl: undefined,
      selectedMetadata: {},
    },
  ];

  return {
    notifyMock: vi.fn(),
    authState: {
      user: { id: 'user-123', email: 'test@example.com', username: 'tester' },
      isAuthenticated: true,
      initialCheckComplete: true,
      isLoading: false,
    },
    baseTargets,
    randomizerState: {
      mode: 'diamond' as const,
      canUseDiamond: true,
      canUseColoring: true,
      eligibility: {
        diamondStatuses: ['progress'],
        bookStatuses: ['in_progress'],
        pageStatuses: ['palette_chosen', 'in_progress'],
        ownership: 'owned' as const,
      },
      availableTargets: baseTargets,
      selectedTargets: [baseTargets[0]],
      selectedTargetIds: new Set(['p-1']),
      randomizerNextUp: { version: 1 as const, targets: {} },
      activeNextUpTarget: null,
      lastSpinResult: null,
      sectionDraft: null,
      stats: {
        totalSpins: 0,
        recentSpins: 0,
        hasProjects: true,
        hasTargets: true,
        hasSelection: true,
        totalProjects: 2,
        totalTargets: 2,
        selectedCount: 1,
        canSpin: true,
      },
      isLoading: false,
      isLoadingTargets: false,
      isCreatingSpin: false,
      isSavingNextUp: false,
      isPersistingSection: false,
      isSavingProgressNote: false,
      isSavingRandomizerNote: false,
      isPickingPageFromBook: false,
      error: null,
      spinError: null,
      pagePickError: null,
      setMode: vi.fn(),
      updateEligibility: vi.fn(),
      resetEligibility: vi.fn(),
      toggleTarget: vi.fn(),
      selectAllTargets: vi.fn(),
      selectNoTargets: vi.fn(),
      toggleNextUpTarget: vi.fn(),
      clearNextUpTarget: vi.fn(),
      handleSpinComplete: vi.fn(),
      handleSectionChange: vi.fn(),
      pickRandomPageFromBook: vi.fn(),
      clearLastResult: vi.fn(),
      setSectionDraft: vi.fn(),
      saveDiamondProgressNote: vi.fn(),
      saveRandomizerNote: vi.fn(),
      canSaveRandomizerNote: false,
      canPickRandomPageFromBook: false,
      getDefaultRandomizerNote: vi.fn(() => ''),
      getDefaultDiamondProgressNote: vi.fn(() => ''),
      getShareableUrl: vi.fn(() => 'http://localhost/randomizer?items=p-1'),
    },
  };
});

// --- Module mocks ---------------------------------------------------------

vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="main-layout">{children}</div>
  ),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
  useMobileDevice: () => ({
    isMobile: false,
    isPhone: false,
    isTouchDevice: false,
    isMobileAndTouch: false,
    isTablet: false,
    isLandscape: false,
    screenSize: 'lg',
    width: 1024,
    height: 768,
  }),
}));

vi.mock('@/hooks/useRandomizer', () => ({
  useRandomizer: () => randomizerState,
}));

vi.mock('@/lib/notifications', () => ({
  notify: notifyMock,
  notifySuccess: notifyMock,
  notifyWarning: notifyMock,
  notifyError: notifyMock,
  notifyInfo: notifyMock,
}));

// --- Setup / teardown -----------------------------------------------------

beforeEach(() => {
  guard.reset();
  notifyMock.mockReset();
  randomizerState.mode = 'diamond';
  randomizerState.availableTargets = [...baseTargets];
  randomizerState.selectedTargets = [baseTargets[0]];
  randomizerState.selectedTargetIds = new Set(['p-1']);
  randomizerState.lastSpinResult = null;
  randomizerState.sectionDraft = null;
  randomizerState.stats = {
    totalSpins: 0,
    recentSpins: 0,
    hasProjects: true,
    hasTargets: true,
    hasSelection: true,
    totalProjects: 2,
    totalTargets: 2,
    selectedCount: 1,
    canSpin: true,
  };
  randomizerState.isCreatingSpin = false;
  randomizerState.toggleTarget.mockReset();
  randomizerState.selectAllTargets.mockReset();
  randomizerState.selectNoTargets.mockReset();
  randomizerState.toggleNextUpTarget.mockReset();
  randomizerState.clearNextUpTarget.mockReset();
  randomizerState.handleSpinComplete.mockReset();
  randomizerState.handleSectionChange.mockReset();
  randomizerState.pickRandomPageFromBook.mockReset();
  randomizerState.clearLastResult.mockReset();
});

afterEach(() => {
  guard.restore();
});

// --- Tests ----------------------------------------------------------------

describe('ProjectRandomizer route mount (real wheel + selector + history)', () => {
  it('mounts the randomizer page without triggering a render loop', async () => {
    const { default: ProjectRandomizer } = await import('../ProjectRandomizer');

    renderWithProviders(<ProjectRandomizer />);

    // Page heading confirms we got past auth + data guards.
    expect(await screen.findByRole('heading', { name: /randomizer/i })).toBeInTheDocument();

    await new Promise(resolve => setTimeout(resolve, 50));

    assertNoRenderLoop(guard);
  });

  it('does not render an error-boundary fallback on mount', async () => {
    const { default: ProjectRandomizer } = await import('../ProjectRandomizer');

    renderWithProviders(<ProjectRandomizer />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /randomizer/i })).toBeInTheDocument();
    });

    expect(screen.queryByText(ERROR_BOUNDARY_FALLBACK_PATTERNS.headline)).not.toBeInTheDocument();
    expect(screen.queryByText(ERROR_BOUNDARY_FALLBACK_PATTERNS.bodyText)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: ERROR_BOUNDARY_FALLBACK_PATTERNS.retryButton })
    ).not.toBeInTheDocument();
  });
});

describe('ProjectRandomizer behavior', () => {
  it('renders the available randomizer targets in the selector', async () => {
    const { default: ProjectRandomizer } = await import('../ProjectRandomizer');

    renderWithProviders(<ProjectRandomizer />);

    expect(
      await screen.findByRole('button', { name: /deselect aurora wolves/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select starlit garden/i })).toBeInTheDocument();
    expect(screen.getByText('1 of 2 selected')).toBeInTheDocument();
  });

  it('updates target selection and spin eligibility from selector actions', async () => {
    const user = userEvent.setup();
    randomizerState.selectedTargets = [];
    randomizerState.selectedTargetIds = new Set();
    randomizerState.stats = {
      ...randomizerState.stats,
      hasSelection: false,
      selectedCount: 0,
      canSpin: false,
    };
    const { default: ProjectRandomizer } = await import('../ProjectRandomizer');

    const view = renderWithProviders(<ProjectRandomizer />);

    expect(await screen.findByRole('button', { name: /spin .*disabled/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /select aurora wolves/i }));

    expect(randomizerState.toggleTarget).toHaveBeenCalledWith('p-1');

    randomizerState.selectedTargets = [baseTargets[0]];
    randomizerState.selectedTargetIds = new Set(['p-1']);
    randomizerState.stats = {
      ...randomizerState.stats,
      hasSelection: true,
      selectedCount: 1,
      canSpin: true,
    };
    view.rerender(<ProjectRandomizer />);

    expect(screen.getByRole('button', { name: /spin the wheel/i })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /deselect aurora wolves/i }));
    expect(randomizerState.toggleTarget).toHaveBeenLastCalledWith('p-1');
  });

  it('completes a spin with the selected target when eligible targets are selected', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const user = userEvent.setup();
    const { default: ProjectRandomizer } = await import('../ProjectRandomizer');

    try {
      renderWithProviders(<ProjectRandomizer />);

      await user.click(await screen.findByRole('button', { name: /spin the wheel/i }));
      const transitionEnd = new Event('transitionend', { bubbles: true });
      Object.defineProperty(transitionEnd, 'propertyName', { value: 'transform' });
      screen.getByTestId('randomizer-wheel-disc').dispatchEvent(transitionEnd);

      await waitFor(() => {
        expect(randomizerState.handleSpinComplete).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'p-1', title: 'Aurora Wolves' })
        );
      });
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('displays the most recent spin result after a successful spin', async () => {
    randomizerState.lastSpinResult = baseTargets[1];
    const { default: ProjectRandomizer } = await import('../ProjectRandomizer');

    renderWithProviders(<ProjectRandomizer />);

    expect(await screen.findByRole('heading', { name: 'Starlit Garden' })).toBeInTheDocument();
    expect(screen.getByText(/selected diamond painting/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view project/i })).toHaveAttribute(
      'href',
      '/projects/p-2'
    );
  });

  it('clears the visible spin result when the result is dismissed', async () => {
    const user = userEvent.setup();
    randomizerState.lastSpinResult = baseTargets[1];
    const { default: ProjectRandomizer } = await import('../ProjectRandomizer');

    renderWithProviders(<ProjectRandomizer />);

    await user.click(await screen.findByRole('button', { name: /clear result/i }));

    expect(randomizerState.clearLastResult).toHaveBeenCalledOnce();
  });
});
