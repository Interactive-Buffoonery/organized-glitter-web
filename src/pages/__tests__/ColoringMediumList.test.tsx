import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
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

  it('ignores a second save while medium creation is starting', async () => {
    createMediumMutateAsync.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderColoringMediumList();

    await user.click(screen.getByRole('button', { name: /add coloring medium/i }));
    await user.type(screen.getByLabelText('Name'), 'New pencils');
    const form = screen.getByRole('button', { name: 'Save' }).closest('form');

    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    fireEvent.submit(form!);

    expect(createMediumMutateAsync).toHaveBeenCalledTimes(1);
  });

  it('blocks reopening until an update is reflected in refreshed data', async () => {
    let resolveUpdate!: (value: unknown) => void;
    updateMediumMutateAsync.mockReturnValue(
      new Promise(resolve => {
        resolveUpdate = resolve;
      })
    );
    const user = userEvent.setup();
    const view = renderColoringMediumList();

    await user.click(screen.getByRole('button', { name: /edit prismacolor premier/i }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Updated pencils' } });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByRole('button', { name: /edit prismacolor premier/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /edit prismacolor premier/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    mediumsFetchingRef.value = true;
    await act(async () => {
      resolveUpdate({ ...baseMedium, name: 'Updated pencils' });
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: /edit prismacolor premier/i })).toBeDisabled();

    mediumItemsRef.value = [{ ...baseMedium, name: 'Updated pencils' }];
    mediumsFetchingRef.value = false;
    view.rerender(
      <MemoryRouter>
        <ColoringMediumList />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: /edit updated pencils/i }));

    expect(screen.getByLabelText('Name')).toHaveValue('Updated pencils');
  });
});
