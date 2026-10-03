/**
 * Regression tests for AddTagDialog.
 *
 * Locks in:
 *   - On successful mutation, the dialog closes and onTagAdded is called.
 *   - The mutation is invoked with trimmed name + selected color.
 *   - Empty / overlong names are rejected before mutation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AddTagDialog from '../AddTagDialog';

const mutateMock = vi.fn();
let mutationIsPending = false;
vi.mock('@/hooks/mutations/useCreateTag', () => ({
  useCreateTag: () => ({
    mutate: mutateMock,
    get isPending() {
      return mutationIsPending;
    },
  }),
}));

const { toastMock } = vi.hoisted(() => ({
  toastMock: vi.fn(),
}));
vi.mock('@/lib/notifications', () => ({
  notify: toastMock,
  notifySuccess: toastMock,
  notifyWarning: toastMock,
  notifyError: toastMock,
  notifyInfo: toastMock,
}));

const openDialog = () => {
  fireEvent.click(screen.getByRole('button', { name: /add tag/i }));
};

// After the dialog opens, the trigger and the submit button BOTH say "Add Tag".
// Find the submit button via type="submit" inside the dialog form.
const clickSubmit = () => {
  const submit = document.querySelector('form button[type="submit"]') as HTMLButtonElement | null;
  if (!submit) throw new Error('submit button not found');
  fireEvent.click(submit);
};

describe('AddTagDialog', () => {
  beforeEach(() => {
    mutateMock.mockReset();
    toastMock.mockReset();
    mutationIsPending = false;
  });

  it('renders an Add Tag trigger button', () => {
    render(<AddTagDialog />);
    expect(screen.getByRole('button', { name: /add tag/i })).toBeInTheDocument();
  });

  it('shows an error toast when submitted with an empty name', () => {
    render(<AddTagDialog />);
    openDialog();
    clickSubmit();
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }));
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('disables the submit button and does not submit when name is over 100 characters', () => {
    render(<AddTagDialog />);
    openDialog();
    fireEvent.change(screen.getByLabelText(/tag name/i), {
      target: { value: 'x'.repeat(101) },
    });
    const submit = document.querySelector('form button[type="submit"]') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('submits the trimmed name and a color', () => {
    render(<AddTagDialog />);
    openDialog();
    fireEvent.change(screen.getByLabelText(/tag name/i), {
      target: { value: '  forest  ' },
    });
    clickSubmit();

    expect(mutateMock).toHaveBeenCalledTimes(1);
    const [variables] = mutateMock.mock.calls[0];
    expect(variables.name).toBe('forest');
    expect(variables.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('on success closes the dialog and fires onTagAdded callback', async () => {
    const onTagAdded = vi.fn();
    render(<AddTagDialog onTagAdded={onTagAdded} />);
    openDialog();
    fireEvent.change(screen.getByLabelText(/tag name/i), {
      target: { value: 'beach' },
    });
    clickSubmit();

    const [, callbacks] = mutateMock.mock.calls[0];
    callbacks.onSuccess();

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(onTagAdded).toHaveBeenCalledTimes(1);
  });
});
