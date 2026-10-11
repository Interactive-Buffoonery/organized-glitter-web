import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddTagDialog from '../AddTagDialog';
import EditTagDialog from '../EditTagDialog';
import type { Tag } from '@/types/tag';

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('@/hooks/mutations/useCreateTag', () => ({
  useCreateTag: () => ({ mutate, isPending: false }),
}));
vi.mock('@/hooks/mutations/useUpdateTag', () => ({
  useUpdateTag: () => ({ mutate, isPending: false }),
}));

const tag: Tag = {
  id: 'tag-1',
  userId: 'user-1',
  name: 'forest',
  slug: 'forest',
  color: '#3B82F6',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

// jsdom covers DOM associations and error lifecycle; real AT announcements need browser checks.
describe.each(['add', 'edit'] as const)('%s tag name validation', mode => {
  const open = () => {
    render(mode === 'add' ? <AddTagDialog /> : <EditTagDialog tag={tag} />);
    fireEvent.click(screen.getByRole('button', { name: mode === 'add' ? /^add tag$/i : 'Edit' }));
    const dialog = screen.getByRole('dialog');
    return {
      input: within(dialog).getByRole('textbox', { name: /tag name/i }),
      submit: within(dialog).getByRole('button', {
        name: mode === 'add' ? /^add tag$/i : 'Update Tag',
      }),
    };
  };

  beforeEach(() => mutate.mockReset());

  it.each(['', '   '])(
    'associates blank submission with an error and focuses the field: %j',
    async value => {
      const { input, submit } = open();
      expect(input).toBeRequired();
      fireEvent.change(input, { target: { value } });
      submit.focus();
      fireEvent.click(submit);
      expect(mutate).not.toHaveBeenCalled();
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAccessibleDescription('Tag name cannot be empty');
      await waitFor(() => expect(input).toHaveFocus());
      const error = document.getElementById(input.getAttribute('aria-describedby')!);
      expect(error).toBeVisible();
      expect(error).toHaveAttribute('aria-live', 'polite');
      fireEvent.change(input, { target: { value: '  corrected  ' } });
      expect(input).not.toHaveAttribute('aria-invalid', 'true');
      expect(input).not.toHaveAccessibleDescription('Tag name cannot be empty');
      fireEvent.click(submit);
      expect(mutate).toHaveBeenCalledOnce();
    }
  );

  it('shows overlength feedback immediately and accepts 100 trimmed characters', () => {
    const { input, submit } = open();
    const id = input.id;
    fireEvent.change(input, { target: { value: 'x'.repeat(101) } });
    expect(input).toHaveAccessibleDescription('Tag name must be 100 characters or less');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: `  ${'x'.repeat(100)}  ` } });
    expect(input.id).toBe(id);
    expect(input).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('100/100')).toBeVisible();
    fireEvent.click(submit);
    expect(mutate).toHaveBeenCalledOnce();
    const variables = mutate.mock.calls[0][0];
    expect(mode === 'add' ? variables.name : variables.updates.name).toBe('x'.repeat(100));
  });

  it('submits from the keyboard and clears validation state on reopening', async () => {
    const user = userEvent.setup();
    const { input } = open();
    await user.clear(input);
    await user.keyboard('{Enter}');
    expect(input).toHaveAccessibleDescription('Tag name cannot be empty');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: mode === 'add' ? /^add tag$/i : 'Edit' }));
    expect(screen.getByRole('textbox', { name: /tag name/i })).not.toHaveAttribute(
      'aria-invalid',
      'true'
    );
  });
});
