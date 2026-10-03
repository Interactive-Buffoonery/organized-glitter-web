import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { RandomizerNoteDialog } from '../RandomizerNoteDialog';

describe('RandomizerNoteDialog', () => {
  it('prefills the note and saves edited content', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderWithProviders(
      <RandomizerNoteDialog defaultContent="The randomizer picked this page" onSave={onSave} />
    );

    await user.click(screen.getByRole('button', { name: /save page note/i }));

    const textarea = screen.getByRole('textbox', { name: /page note/i });
    expect(textarea).toHaveValue('The randomizer picked this page');

    await user.clear(textarea);
    await user.type(textarea, 'A more specific note');
    await user.click(screen.getByRole('button', { name: /save note/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('A more specific note');
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('disables saving blank notes', async () => {
    const user = userEvent.setup();

    renderWithProviders(<RandomizerNoteDialog defaultContent="Draft" onSave={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /save page note/i }));
    await user.clear(screen.getByRole('textbox', { name: /page note/i }));

    expect(screen.getByRole('button', { name: /save note/i })).toBeDisabled();
  });

  it('supports progress note labels', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    renderWithProviders(
      <RandomizerNoteDialog
        defaultContent="The randomizer picked this diamond painting: Aurora Wolves"
        triggerLabel="Save progress note"
        title="Save progress note"
        description="Add an optional progress note to the selected diamond painting."
        textareaLabel="Progress note"
        onSave={onSave}
      />
    );

    await user.click(screen.getByRole('button', { name: /save progress note/i }));

    expect(screen.getByRole('dialog', { name: /save progress note/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /progress note/i })).toHaveValue(
      'The randomizer picked this diamond painting: Aurora Wolves'
    );
  });
});
