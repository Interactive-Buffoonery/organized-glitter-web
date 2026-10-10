import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import AddTagDialog from '../AddTagDialog';

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('@/hooks/mutations/useCreateTag', () => ({
  useCreateTag: () => ({ mutate, isPending: false }),
}));
vi.mock('@/components/ui/dialog', async importOriginal => {
  const actual = await importOriginal<typeof import('@/components/ui/dialog')>();
  return {
    ...actual,
    // Keep content mounted to exercise the real closing-animation validation lifecycle.
    DialogContent: (props: ComponentProps<typeof actual.DialogContent>) => (
      <div role="dialog">{props.children}</div>
    ),
  };
});

describe('AddTagDialog closing validation', () => {
  it('does not announce a required error while clearing a successfully saved name', () => {
    render(<AddTagDialog />);
    fireEvent.click(screen.getAllByRole('button', { name: /^add tag$/i })[0]);
    const dialog = screen.getByRole('dialog');
    const input = within(dialog).getByRole('textbox', { name: /tag name/i });
    const error = document.getElementById(`${input.id}-error`);
    fireEvent.change(input, { target: { value: 'forest' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^add tag$/i }));
    act(() => mutate.mock.calls[0][1].onSuccess());
    expect(input).toHaveValue('');
    expect(error).toBeInTheDocument();
    expect(error).toBeEmptyDOMElement();
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });
});
