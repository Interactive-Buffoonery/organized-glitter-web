import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ProgressNoteItem from '../ProgressNoteItem';
import type { ProgressNote } from '@/types/project';

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
      aria-label="Progress note content"
      value={value}
      disabled={disabled}
      onChange={event => onChange(event.target.value)}
    />
  ),
}));

const note: ProgressNote = {
  id: 'note-1',
  projectId: 'project-1',
  content: 'Plain **bold** note',
  date: '2026-04-24',
  createdAt: '2026-04-24 00:00:00.000Z',
  updatedAt: '2026-04-24 00:00:00.000Z',
};

describe('ProgressNoteItem rich text', () => {
  it('renders Markdown content in the timeline', () => {
    render(<ProgressNoteItem note={note} />);

    expect(screen.getByText('bold')).toBeInTheDocument();
    expect(screen.queryByText(/Plain \*\*bold\*\* note/)).not.toBeInTheDocument();
  });

  it('saves an empty edited note', async () => {
    const user = userEvent.setup();
    const onUpdateNote = vi.fn().mockResolvedValue(undefined);

    render(<ProgressNoteItem note={note} onUpdateNote={onUpdateNote} />);

    await user.click(screen.getByRole('button', { name: 'Edit progress note' }));
    const editor = screen.getByLabelText('Progress note content');
    await user.clear(editor);
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onUpdateNote).toHaveBeenCalledWith('note-1', '');
    });
  });

  it('keeps note actions accessible in the canonical layout', () => {
    render(<ProgressNoteItem note={note} onUpdateNote={vi.fn()} onDeleteNote={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Edit progress note' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete progress note' })).toBeInTheDocument();
  });

  it('keeps the image removal action accessible with the image', () => {
    render(
      <ProgressNoteItem
        note={{ ...note, imageUrl: 'https://example.test/progress.jpg' }}
        onDeleteImage={vi.fn()}
      />
    );

    expect(
      screen.getByRole('img', { name: 'Progress update from April 24, 2026' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove progress note image' })).toBeInTheDocument();
  });
});
