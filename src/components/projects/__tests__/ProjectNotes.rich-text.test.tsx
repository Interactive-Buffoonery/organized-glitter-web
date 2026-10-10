import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureSessionDrafts,
  clearSessionDrafts,
  hasSessionDraft,
  registerSessionDraft,
  takeSessionDraft,
} from '@/services/auth/sessionRecovery';

import ProjectNotes from '../form/ProjectNotes';

vi.mock('@/components/notes/RichTextEditor.lazy', () => ({
  default: ({
    value,
    onChange,
    disabled,
  }: {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
  }) => (
    <textarea
      aria-label="Project notes"
      value={value}
      disabled={disabled}
      onChange={event => onChange(event.target.value)}
    />
  ),
}));

afterEach(clearSessionDrafts);

describe('ProjectNotes rich text', () => {
  it('restores and re-registers unsaved notes for the same account under StrictMode', () => {
    const key = 'project-notes:one';
    const unregister = registerSessionDraft(key, () => 'Unsent **note**');
    captureSessionDrafts('account-a', 'token-a');
    unregister();

    render(
      <StrictMode>
        <ProjectNotes notes="Saved note" sessionDraftKey={key} accountId="account-a" />
      </StrictMode>
    );

    expect(screen.getByRole('textbox', { name: 'Project notes' })).toHaveValue('Unsent **note**');
    expect(hasSessionDraft(key, 'account-a')).toBe(false);
    captureSessionDrafts('account-a', 'token-b');
    expect(takeSessionDraft(key, 'account-a')).toBe('Unsent **note**');
  });

  it('does not restore another account’s unsaved notes', () => {
    const key = 'project-notes:one';
    const unregister = registerSessionDraft(key, () => 'Private note');
    captureSessionDrafts('account-a', 'token-a');
    unregister();

    render(<ProjectNotes notes="Saved note" sessionDraftKey={key} accountId="account-b" />);

    expect(screen.queryByRole('textbox', { name: 'Project notes' })).not.toBeInTheDocument();
    expect(screen.getByText('Saved note')).toBeInTheDocument();
    expect(hasSessionDraft(key, 'account-a')).toBe(false);
  });

  it('opens unsent notes when the account arrives after mount', () => {
    const key = 'project-notes:late-account';
    const unregister = registerSessionDraft(key, () => 'Unsent after login');
    captureSessionDrafts('account-a', 'late-account-token');
    unregister();

    const { rerender } = render(<ProjectNotes notes="Saved note" sessionDraftKey={key} />);
    rerender(<ProjectNotes notes="Saved note" sessionDraftKey={key} accountId="account-a" />);

    expect(screen.getByRole('textbox', { name: 'Project notes' })).toHaveValue(
      'Unsent after login'
    );
    expect(hasSessionDraft(key, 'account-a')).toBe(false);
  });

  it.each([
    '<p>Saved kit details</p>',
    '<a href="https://example.test">Saved kit details</a>',
    '<img src="saved-kit.jpg" alt="Saved kit details">',
    '<table><tr><td>Saved kit details</td></tr></table>',
    '<section>Saved kit details</section>',
  ])('keeps the original HTML available in the editor for %s', async notes => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<ProjectNotes notes={notes} onSave={onSave} variant="inline" />);
    expect(
      screen.getByText('This note uses an older format. Edit it to view or update its contents.')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit notes' }));
    expect(screen.getByRole('textbox', { name: 'Project notes' })).toHaveValue(notes);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it.each(['<https://example.test>', '<artist@example.test>', '`<table>`'])(
    'keeps Markdown autolinks and code out of the legacy format prompt: %s',
    notes => {
      render(<ProjectNotes notes={notes} onSave={vi.fn()} variant="inline" />);
      expect(screen.queryByText(/This note uses an older format/)).not.toBeInTheDocument();
    }
  );

  it('renders Markdown project notes', () => {
    render(<ProjectNotes notes="Kit has **square drills**" readOnly />);

    expect(screen.getByText('square drills')).toBeInTheDocument();
    expect(screen.queryByText(/Kit has \*\*square drills\*\*/)).not.toBeInTheDocument();
  });

  it('saves Markdown project notes from the editor', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(<ProjectNotes notes="Before" onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: /edit/i }));
    const editor = screen.getByLabelText('Project notes');
    await user.clear(editor);
    await user.type(editor, 'After **bold** note');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('After **bold** note');
    });
  });

  it('reserves room for the inline edit control', () => {
    render(<ProjectNotes notes="" onSave={vi.fn()} variant="inline" />);

    expect(screen.getByText(/No notes yet/)).toHaveClass('flex-1');
    expect(screen.getByRole('button', { name: /edit notes/i })).toBeInTheDocument();
  });
});
