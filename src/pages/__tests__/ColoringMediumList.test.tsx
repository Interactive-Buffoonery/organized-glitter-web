import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const {
  createMediumMutateAsync,
  deleteMediumMutate,
  mediumItemsRef,
  mediumsFetchingRef,
  updateMediumMutateAsync,
} = vi.hoisted(() => ({
  createMediumMutateAsync: vi.fn(),
  deleteMediumMutate: vi.fn(),
  mediumItemsRef: { value: [] as Array<Record<string, unknown>> },
  mediumsFetchingRef: { value: false },
  updateMediumMutateAsync: vi.fn(),
}));

const baseMedium = {
  id: 'medium-1',
  userId: 'user-123',
  name: 'Prismacolor Premier',
  type: 'colored_pencil',
  brand: 'Prismacolor',
  colorCount: 72,
  notes: '',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/hooks/useEnabledVerticals', () => ({
  useEnabledVerticals: () => ({ diamond_painting: true, coloring_books: true, isLoading: false }),
}));

vi.mock('@/hooks/useAppReady', () => ({
  useAppReady: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-123' },
  }),
}));

vi.mock('@/hooks/queries/coloring/useColoringMediums', () => ({
  useColoringMediums: () => ({
    data: { items: mediumItemsRef.value },
    isLoading: false,
    isFetching: mediumsFetchingRef.value,
  }),
}));

vi.mock('@/hooks/mutations/coloring/useColoringMediumMutations', () => ({
  useCreateColoringMedium: () => ({ isPending: false, mutateAsync: createMediumMutateAsync }),
  useUpdateColoringMedium: () => ({ isPending: false, mutateAsync: updateMediumMutateAsync }),
  useDeleteColoringMedium: () => ({ isPending: false, mutate: deleteMediumMutate }),
}));

import ColoringMediumList from '../ColoringMediumList';

const renderColoringMediumList = () =>
  render(
    <MemoryRouter>
      <ColoringMediumList />
    </MemoryRouter>
  );

describe('ColoringMediumList delete confirmation', () => {
  beforeEach(() => {
    createMediumMutateAsync.mockReset();
    deleteMediumMutate.mockReset();
    updateMediumMutateAsync.mockReset();
    mediumItemsRef.value = [baseMedium];
    mediumsFetchingRef.value = false;
  });

  it('asks for confirmation before deleting a coloring medium', async () => {
    const user = userEvent.setup();

    renderColoringMediumList();

    await user.click(screen.getByRole('button', { name: /delete prismacolor premier/i }));

    expect(deleteMediumMutate).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Delete Prismacolor Premier?');

    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(deleteMediumMutate).toHaveBeenCalledWith(
      'medium-1',
      expect.objectContaining({ onSettled: expect.any(Function) })
    );
  });
});
