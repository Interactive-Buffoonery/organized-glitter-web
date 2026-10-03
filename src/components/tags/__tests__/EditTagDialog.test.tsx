/**
 * Regression tests for EditTagDialog.
 *
 * Locks in:
 *   - On successful mutation, the dialog closes.
 *   - On mutation error, the dialog stays open so the user can retry.
 *   - The mutation is invoked with the trimmed tag name and selected color.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EditTagDialog from '../EditTagDialog';
import type { Tag } from '@/types/tag';

// Mock the mutation hook so we can drive onSuccess/onError outcomes.
const mutateMock = vi.fn();
let mutationIsPending = false;
vi.mock('@/hooks/mutations/useUpdateTag', () => ({
  useUpdateTag: () => ({
    mutate: mutateMock,
    get isPending() {
      return mutationIsPending;
    },
  }),
}));

vi.mock('@/utils/logger', () => ({
  logger: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createLogger: () => ({
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const mockTag: Tag = {
  id: 'tag-1',
  userId: 'user-1',
  name: 'landscape',
  slug: 'landscape',
  color: '#3B82F6',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const openDialog = () => {
  const trigger = screen.getByRole('button', { name: /edit/i });
  fireEvent.click(trigger);
};

describe('EditTagDialog', () => {
  beforeEach(() => {
    mutateMock.mockReset();
    mutationIsPending = false;
  });

  it('renders an Edit trigger button', () => {
    render(<EditTagDialog tag={mockTag} />);
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
  });

  it('opens the dialog with the tag name pre-filled', () => {
    render(<EditTagDialog tag={mockTag} />);
    openDialog();
    expect(screen.getByLabelText(/tag name/i)).toHaveValue('landscape');
  });

  it('submits the trimmed name and selected color via the mutation', () => {
    render(<EditTagDialog tag={mockTag} />);
    openDialog();
    const input = screen.getByLabelText(/tag name/i);
    fireEvent.change(input, { target: { value: '  mountains  ' } });
    fireEvent.click(screen.getByRole('button', { name: /update tag/i }));

    expect(mutateMock).toHaveBeenCalledTimes(1);
    const [variables] = mutateMock.mock.calls[0];
    expect(variables).toEqual({
      id: 'tag-1',
      updates: { name: 'mountains', color: '#3B82F6' },
    });
  });

  it('does not submit when the trimmed name is empty', () => {
    render(<EditTagDialog tag={mockTag} />);
    openDialog();
    const input = screen.getByLabelText(/tag name/i);
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /update tag/i }));
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('does not submit when the name exceeds 100 characters', () => {
    render(<EditTagDialog tag={mockTag} />);
    openDialog();
    const input = screen.getByLabelText(/tag name/i);
    fireEvent.change(input, { target: { value: 'x'.repeat(101) } });
    fireEvent.click(screen.getByRole('button', { name: /update tag/i }));
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('closes the dialog on mutation onSuccess (no explicit refresh call needed)', async () => {
    render(<EditTagDialog tag={mockTag} />);
    openDialog();
    fireEvent.change(screen.getByLabelText(/tag name/i), { target: { value: 'updated' } });
    fireEvent.click(screen.getByRole('button', { name: /update tag/i }));

    // Drive the mutation's onSuccess callback.
    const [, callbacks] = mutateMock.mock.calls[0];
    callbacks.onSuccess();

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('keeps the dialog open on mutation onError so the user can retry', async () => {
    render(<EditTagDialog tag={mockTag} />);
    openDialog();
    fireEvent.change(screen.getByLabelText(/tag name/i), { target: { value: 'duplicate' } });
    fireEvent.click(screen.getByRole('button', { name: /update tag/i }));

    const [, callbacks] = mutateMock.mock.calls[0];
    callbacks.onError(new Error('A tag named "duplicate" already exists'));

    // Dialog must remain open for retry.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
