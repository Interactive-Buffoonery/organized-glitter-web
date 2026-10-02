import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import type React from 'react';
import { describe, expect, it, renderWithProviders, screen, userEvent } from '@/test-utils';
import type { ColoringBookDTO, ColoringPageDTO } from '@/services/pocketbase/coloring.service';
import type { ColoringMediumRecord } from '@/types/coloringMedium';
import { ColoringPageCommandPanel } from '../ColoringPageCommandPanel';

const makeBook = (overrides: Partial<ColoringBookDTO> = {}): ColoringBookDTO =>
  ({
    id: 'book-1',
    userId: 'user-1',
    title: 'Mystery Worlds',
    publisherId: '',
    illustratorId: '',
    series: '',
    theme: '',
    isbn: '',
    coverImage: '',
    isMystery: true,
    status: 'purchased',
    totalPages: 48,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  }) as ColoringBookDTO;

const makePage = (overrides: Partial<ColoringPageDTO> = {}): ColoringPageDTO => ({
  id: 'page-1',
  bookId: 'book-1',
  pageNumber: 7,
  status: 'not_started',
  photos: [],
  mediumIds: [],
  revealedSubject: '',
  revealedAt: '',
  startedAt: '',
  completedAt: '',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  ...overrides,
});

const medium: ColoringMediumRecord = {
  id: 'medium-1',
  userId: 'user-1',
  name: 'Prismacolor',
  type: 'colored_pencil',
  brand: 'Prismacolor',
  colorCount: 72,
  notes: '',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

function makeProps(
  overrides: Partial<React.ComponentProps<typeof ColoringPageCommandPanel>> = {}
): React.ComponentProps<typeof ColoringPageCommandPanel> {
  return {
    page: makePage(),
    book: makeBook(),
    mediums: [medium],
    isMediumsLoading: false,
    userTimezone: 'UTC',
    statusAction: {
      isPending: false,
      changeStatus: vi.fn(),
    },
    lifecycleDates: {
      isPending: false,
      startedAtValue: '',
      completedAtValue: '',
      startedAtDraft: '',
      completedAtDraft: '',
      setStartedAtDraft: vi.fn(),
      setCompletedAtDraft: vi.fn(),
      saveStartedAt: vi.fn(),
      saveCompletedAt: vi.fn(),
      clearStartedAt: vi.fn(),
      clearCompletedAt: vi.fn(),
    },
    mediumSelection: {
      isPending: false,
      selectedMediumIds: [],
      toggleMedium: vi.fn(),
    },
    mysteryReveal: {
      isPending: false,
      isEditingReveal: false,
      revealedSubject: '',
      setRevealedSubject: vi.fn(),
      startRevealEditing: vi.fn(),
      cancelRevealEditing: vi.fn(),
      submitReveal: vi.fn(),
      clearReveal: vi.fn(),
    },
    ...overrides,
  };
}

vi.mock('@/components/coloring/detail/page/ColorReferenceSection', () => ({
  ColorReferenceSection: () => null,
}));

describe('ColoringPageCommandPanel', () => {
  it('announces medium loading with role status', () => {
    renderWithProviders(<ColoringPageCommandPanel {...makeProps({ isMediumsLoading: true })} />);

    expect(screen.getByRole('status')).toHaveTextContent(/loading mediums/i);
  });

  it('does not render reveal controls for non-mystery books', () => {
    renderWithProviders(
      <ColoringPageCommandPanel {...makeProps({ book: makeBook({ isMystery: false }) })} />
    );

    expect(screen.queryByRole('button', { name: /^reveal$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/what did the mystery turn out to be/i)).not.toBeInTheDocument();
  });

  it('renders reveal controls for mystery books', () => {
    renderWithProviders(<ColoringPageCommandPanel {...makeProps()} />);

    expect(screen.getByRole('button', { name: /^reveal$/i })).toBeInTheDocument();
  });

  it('renders an unreveal action for revealed mystery pages', async () => {
    const user = userEvent.setup();
    const clearReveal = vi.fn();

    renderWithProviders(
      <ColoringPageCommandPanel
        {...makeProps({
          page: makePage({
            revealedSubject: 'Dragon',
            revealedAt: '2026-05-17T16:20:00.000Z',
          }),
          mysteryReveal: {
            isPending: false,
            isEditingReveal: false,
            revealedSubject: 'Dragon',
            setRevealedSubject: vi.fn(),
            startRevealEditing: vi.fn(),
            cancelRevealEditing: vi.fn(),
            submitReveal: vi.fn(),
            clearReveal,
          },
        })}
      />
    );

    await user.click(screen.getByRole('button', { name: /mark unrevealed/i }));

    expect(clearReveal).toHaveBeenCalledTimes(1);
  });

  it('structures command sections as headings without redundant region landmarks', () => {
    renderWithProviders(<ColoringPageCommandPanel {...makeProps()} />);

    expect(screen.queryAllByRole('region')).toHaveLength(0);

    expect(screen.getByRole('heading', { name: /^dates$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^mediums$/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /what did the mystery turn out to be/i })
    ).toBeInTheDocument();
  });

  it('groups medium toggles under an accessible name tied to the mediums heading', () => {
    renderWithProviders(<ColoringPageCommandPanel {...makeProps()} />);

    const group = screen.getByRole('group', { name: /^mediums$/i });
    expect(group).toBeInTheDocument();
    expect(group).toContainElement(screen.getByRole('button', { name: /prismacolor/i }));
  });

  it('wires section disabled props to their controls', () => {
    renderWithProviders(
      <ColoringPageCommandPanel
        {...makeProps({
          mediumSelection: {
            isPending: true,
            selectedMediumIds: [],
            toggleMedium: vi.fn(),
          },
          mysteryReveal: {
            isPending: false,
            isEditingReveal: true,
            revealedSubject: 'Dragon',
            setRevealedSubject: vi.fn(),
            startRevealEditing: vi.fn(),
            cancelRevealEditing: vi.fn(),
            submitReveal: vi.fn(),
            clearReveal: vi.fn(),
          },
        })}
      />
    );

    expect(screen.getByRole('button', { name: /prismacolor/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /save reveal/i })).toBeEnabled();
  });
});
