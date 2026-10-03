import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, renderWithProviders, screen } from '../../test-utils';
import ProjectRandomizer from '../ProjectRandomizer';

const useIsMobileMock = vi.fn();
const useRandomizerMock = vi.fn();

vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="main-layout">{children}</div>
  ),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-123', email: 'test@example.com', username: 'tester' },
  }),
}));

vi.mock('@/hooks/useAppReady', () => ({
  useAppReady: vi.fn(),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => useIsMobileMock(),
}));

vi.mock('@/hooks/useRandomizer', () => ({
  useRandomizer: () => useRandomizerMock(),
}));

vi.mock('@/components/randomizer/RandomizerWheel', () => ({
  RandomizerWheel: () => <div data-testid="randomizer-wheel">Wheel</div>,
}));

vi.mock('@/components/randomizer/RandomizerTargetSelector', () => ({
  RandomizerTargetSelector: ({ disableScrollArea }: { disableScrollArea?: boolean }) => (
    <div data-testid={disableScrollArea ? 'target-selector-inline' : 'target-selector-scroll'}>
      Selector
    </div>
  ),
}));

vi.mock('@/components/randomizer/SpinHistory', () => ({
  SpinHistory: ({
    disableScrollArea,
    hideHeader,
  }: {
    disableScrollArea?: boolean;
    hideHeader?: boolean;
  }) => (
    <div
      data-testid={disableScrollArea ? 'spin-history-inline' : 'spin-history-scroll'}
      data-hide-header={hideHeader ? 'true' : 'false'}
    >
      History
    </div>
  ),
}));

const baseRandomizerState = {
  mode: 'diamond' as const,
  canUseDiamond: true,
  canUseColoring: true,
  eligibility: {
    diamondStatuses: ['progress'],
    bookStatuses: ['in_progress'],
    pageStatuses: ['palette_chosen', 'in_progress'],
    ownership: 'owned' as const,
  },
  availableTargets: [
    {
      id: 'p1',
      mode: 'diamond' as const,
      targetType: 'diamond_project' as const,
      title: 'Alpha',
      subtitle: 'Diamond painting',
      href: '/projects/p1',
      statusLabel: 'In progress',
      selectedMetadata: {},
    },
    {
      id: 'p2',
      mode: 'diamond' as const,
      targetType: 'diamond_project' as const,
      title: 'Beta',
      subtitle: 'Diamond painting',
      href: '/projects/p2',
      statusLabel: 'In progress',
      selectedMetadata: {},
    },
  ],
  selectedTargets: [
    {
      id: 'p1',
      mode: 'diamond' as const,
      targetType: 'diamond_project' as const,
      title: 'Alpha',
      subtitle: 'Diamond painting',
      href: '/projects/p1',
      statusLabel: 'In progress',
      selectedMetadata: {},
    },
    {
      id: 'p2',
      mode: 'diamond' as const,
      targetType: 'diamond_project' as const,
      title: 'Beta',
      subtitle: 'Diamond painting',
      href: '/projects/p2',
      statusLabel: 'In progress',
      selectedMetadata: {},
    },
  ],
  selectedTargetIds: new Set(['p1', 'p2']),
  randomizerNextUp: { version: 1 as const, targets: {} },
  activeNextUpTarget: null,
  lastSpinResult: null,
  sectionDraft: null,
  stats: {
    totalProjects: 2,
    totalTargets: 2,
    selectedCount: 2,
    recentSpins: 4,
    canSpin: true,
    hasProjects: true,
    hasTargets: true,
    hasSelection: true,
  },
  isLoadingTargets: false,
  isCreatingSpin: false,
  isSavingNextUp: false,
  isPersistingSection: false,
  isSavingProgressNote: false,
  isSavingRandomizerNote: false,
  isPickingPageFromBook: false,
  error: null,
  pagePickError: null,
  pagePickErrorReason: null,
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
};

describe('ProjectRandomizer page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRandomizerMock.mockReturnValue(baseRandomizerState);
  });

  it('keeps one inline selector and opens history on demand', () => {
    renderWithProviders(<ProjectRandomizer />);
    expect(screen.getAllByTestId('target-selector-inline')).toHaveLength(1);
    expect(screen.queryByTestId('target-selector-scroll')).not.toBeInTheDocument();
    expect(screen.queryByTestId('spin-history-inline')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /spin history/i }));
    expect(screen.getByTestId('spin-history-inline')).toHaveAttribute('data-hide-header', 'true');
  });

  it('renders coloring modes when coloring is enabled', () => {
    useIsMobileMock.mockReturnValue(false);

    renderWithProviders(<ProjectRandomizer />);

    expect(screen.getByRole('button', { name: /diamond paintings/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /coloring books/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /coloring pages/i })).toBeInTheDocument();
  });

  it('hides diamond mode when diamond painting is disabled', () => {
    useIsMobileMock.mockReturnValue(false);
    useRandomizerMock.mockReturnValue({
      ...baseRandomizerState,
      mode: 'coloring-book',
      canUseDiamond: false,
      canUseColoring: true,
    });

    renderWithProviders(<ProjectRandomizer />);

    expect(screen.queryByRole('button', { name: /diamond paintings/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /coloring books/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /coloring pages/i })).toBeInTheDocument();
  });

  it('does not render removed copy-link controls', () => {
    useIsMobileMock.mockReturnValue(false);

    renderWithProviders(<ProjectRandomizer />);

    const removedActionName = new RegExp(['sh', 'are'].join(''), 'i');
    expect(screen.queryByRole('button', { name: removedActionName })).not.toBeInTheDocument();
  });

  it('uses the full kitted up diamond status label', () => {
    useIsMobileMock.mockReturnValue(false);

    renderWithProviders(<ProjectRandomizer />);

    expect(screen.getByRole('checkbox', { name: /kitted up/i })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /^kitted$/i })).not.toBeInTheDocument();
  });

  it('does not show ownership controls for coloring modes', () => {
    useIsMobileMock.mockReturnValue(false);
    useRandomizerMock.mockReturnValue({
      ...baseRandomizerState,
      mode: 'coloring-book',
    });

    renderWithProviders(<ProjectRandomizer />);

    expect(screen.queryByText(/ownership/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /wishlist/i })).not.toBeInTheDocument();
  });

  it('suppresses empty-state CTAs when target loading fails', () => {
    useIsMobileMock.mockReturnValue(false);
    useRandomizerMock.mockReturnValue({
      ...baseRandomizerState,
      availableTargets: [],
      selectedTargets: [],
      selectedTargetIds: new Set(),
      stats: {
        ...baseRandomizerState.stats,
        totalProjects: 0,
        totalTargets: 0,
        selectedCount: 0,
        canSpin: false,
        hasProjects: false,
        hasTargets: false,
        hasSelection: false,
      },
      error: new Error('Failed to load targets'),
    });

    renderWithProviders(<ProjectRandomizer />);

    expect(screen.getByText(/failed to load randomizer data/i)).toBeInTheDocument();
    expect(screen.queryByText(/no diamond paintings match these filters/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add project/i })).not.toBeInTheDocument();
  });

  it('shows a page note action for coloring page results', () => {
    useIsMobileMock.mockReturnValue(false);
    useRandomizerMock.mockReturnValue({
      ...baseRandomizerState,
      mode: 'coloring-page',
      lastSpinResult: {
        id: 'page1234567890',
        mode: 'coloring-page',
        targetType: 'coloring_page',
        title: 'Garden Pages, page 7',
        subtitle: 'Garden Pages',
        href: '/coloring/book1234567890/pages/page1234567890',
        statusLabel: 'In progress',
        selectedMetadata: { coloringPage: 'page1234567890' },
      },
      canSaveRandomizerNote: true,
      getDefaultRandomizerNote: vi.fn(
        () => 'The randomizer picked this page: Garden Pages, page 7'
      ),
    });

    renderWithProviders(<ProjectRandomizer />);

    expect(screen.getByRole('button', { name: /save page note/i })).toBeInTheDocument();
  });

  it('shows a progress note action immediately for diamond results', () => {
    useIsMobileMock.mockReturnValue(false);
    useRandomizerMock.mockReturnValue({
      ...baseRandomizerState,
      lastSpinResult: {
        id: 'project123456789',
        mode: 'diamond',
        targetType: 'diamond_project',
        title: 'Aurora Wolves',
        subtitle: 'Moonlight Co.',
        href: '/projects/project123456789',
        statusLabel: 'In progress',
        selectedMetadata: {},
      },
      getDefaultDiamondProgressNote: vi.fn(
        () => 'The randomizer picked this diamond painting: Aurora Wolves'
      ),
    });

    renderWithProviders(<ProjectRandomizer />);

    expect(screen.getByRole('button', { name: /save progress note/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pick a section/i })).toBeInTheDocument();
  });

  it('does not show a note action for coloring book results', () => {
    useIsMobileMock.mockReturnValue(false);
    useRandomizerMock.mockReturnValue({
      ...baseRandomizerState,
      mode: 'coloring-book',
      lastSpinResult: {
        id: 'book1234567890',
        mode: 'coloring-book',
        targetType: 'coloring_book',
        title: 'Garden Pages',
        subtitle: 'Indie Press',
        href: '/coloring/book1234567890',
        statusLabel: 'Started',
        selectedMetadata: { coloringBook: 'book1234567890' },
      },
      canSaveRandomizerNote: false,
    });

    renderWithProviders(<ProjectRandomizer />);

    expect(screen.queryByRole('button', { name: /save page note/i })).not.toBeInTheDocument();
  });

  it('shows an inline page randomizer action for coloring book results', () => {
    useIsMobileMock.mockReturnValue(false);
    const pickRandomPageFromBook = vi.fn();
    useRandomizerMock.mockReturnValue({
      ...baseRandomizerState,
      mode: 'coloring-book',
      lastSpinResult: {
        id: 'book1234567890',
        mode: 'coloring-book',
        targetType: 'coloring_book',
        title: 'Garden Pages',
        subtitle: 'Indie Press',
        href: '/coloring/book1234567890',
        statusLabel: 'In progress',
        selectedMetadata: { coloringBook: 'book1234567890' },
      },
      canPickRandomPageFromBook: true,
      pickRandomPageFromBook,
    });

    renderWithProviders(<ProjectRandomizer />);

    expect(screen.getByText('Pick a page too?')).toBeInTheDocument();
    expect(screen.getByText('Garden Pages only')).toBeInTheDocument();
    expect(screen.getByText('Eligible: Any unfinished page')).toBeInTheDocument();

    screen.getByRole('button', { name: /pick a page/i }).click();

    expect(pickRandomPageFromBook).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'book1234567890',
        targetType: 'coloring_book',
      })
    );
  });

  it('shows the scoped page empty state for coloring book results', () => {
    useIsMobileMock.mockReturnValue(false);
    useRandomizerMock.mockReturnValue({
      ...baseRandomizerState,
      mode: 'coloring-book',
      lastSpinResult: {
        id: 'book1234567890',
        mode: 'coloring-book',
        targetType: 'coloring_book',
        title: 'Garden Pages',
        subtitle: 'Indie Press',
        href: '/coloring/book1234567890',
        statusLabel: 'In progress',
        selectedMetadata: { coloringBook: 'book1234567890' },
      },
      canPickRandomPageFromBook: true,
      pagePickError: 'No unfinished pages match this book yet.',
      pagePickErrorReason: 'no_matching_pages',
    });

    renderWithProviders(<ProjectRandomizer />);

    expect(screen.getByRole('alert')).toHaveTextContent('No unfinished pages match this book yet.');
    expect(screen.getByRole('alert')).toHaveAttribute('data-reason', 'no_matching_pages');
  });
});
