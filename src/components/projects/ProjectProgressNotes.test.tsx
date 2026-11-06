import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import ProjectProgressNotes from './ProjectProgressNotes';
import type { ProjectType } from '@/types/project';
vi.mock('@/hooks/queries/useProgressNotes', () => ({
  useProgressNotesQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/mutations/useProjectDetailMutations', () => ({
  useAddProgressNoteMutation: () => ({ isPending: false }),
  useUpdateProgressNoteMutation: () => ({ isPending: false }),
  useDeleteProgressNoteMutation: () => ({ isPending: false }),
  useDeleteProgressNoteImageMutation: () => ({ isPending: false }),
}));
vi.mock('./ProgressNoteForm', () => ({
  default: () => <textarea placeholder="Add a progress note" />,
}));
vi.mock('./ProgressNoteDialog', () => ({ ProgressNoteDialog: () => null }));
it('keeps the progress composer available while on hold', () => {
  const project: ProjectType = {
    id: 'kit',
    userId: 'owner',
    title: 'Fox',
    status: 'onhold',
    createdAt: '',
    updatedAt: '',
  };
  render(<ProjectProgressNotes project={project} />);
  expect(screen.getByPlaceholderText('Add a progress note')).toBeVisible();
});
