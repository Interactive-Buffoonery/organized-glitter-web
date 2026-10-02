/**
 * Regression tests for EditArtistDialog.
 *
 * Locks in:
 *   - On successful mutation, the dialog closes (no explicit refresh call needed).
 *   - The mutation is invoked with the trimmed artist name.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EditArtistDialog from '../EditArtistDialog';

const mutateMock = vi.fn();
let mutationIsPending = false;
vi.mock('@/hooks/mutations/useArtistMutations', () => ({
  useUpdateArtist: () => ({
    mutate: mutateMock,
    get isPending() {
      return mutationIsPending;
    },
  }),
}));

const mockArtist = { id: 'artist-1', name: 'Van Gogh' };

const openDialog = () => {
  fireEvent.click(screen.getByRole('button', { name: /edit/i }));
};

describe('EditArtistDialog', () => {
  beforeEach(() => {
    mutateMock.mockReset();
    mutationIsPending = false;
  });

  it('renders an Edit trigger button', () => {
    render(<EditArtistDialog artist={mockArtist} />);
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
  });

  it('opens the dialog with the artist name pre-filled', () => {
    render(<EditArtistDialog artist={mockArtist} />);
    openDialog();
    expect(screen.getByLabelText(/artist name/i)).toHaveValue('Van Gogh');
  });

  it('submits the trimmed artist name via the mutation', () => {
    render(<EditArtistDialog artist={mockArtist} />);
    openDialog();
    fireEvent.change(screen.getByLabelText(/artist name/i), {
      target: { value: '  Monet  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update artist/i }));

    expect(mutateMock).toHaveBeenCalledTimes(1);
    const [variables] = mutateMock.mock.calls[0];
    expect(variables).toEqual({ id: 'artist-1', data: { name: 'Monet' } });
  });

  it('does not submit when the trimmed name is empty', () => {
    render(<EditArtistDialog artist={mockArtist} />);
    openDialog();
    fireEvent.change(screen.getByLabelText(/artist name/i), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update artist/i }));
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('closes the dialog on mutation onSuccess (no explicit refresh call needed)', async () => {
    render(<EditArtistDialog artist={mockArtist} />);
    openDialog();
    fireEvent.change(screen.getByLabelText(/artist name/i), {
      target: { value: 'Renoir' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update artist/i }));

    const [, callbacks] = mutateMock.mock.calls[0];
    callbacks.onSuccess();

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
