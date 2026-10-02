import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '@/test-utils';

import { ProgressNoteDialog, type ProgressNoteDialogTarget } from '../ProgressNoteDialog';

vi.mock('@/components/projects/ProgressNoteForm', () => ({
  default: ({ disabled }: { disabled?: boolean }) => (
    <form aria-label="Progress note fields">
      <button type="submit" disabled={disabled}>
        Submit progress note
      </button>
    </form>
  ),
}));

const renderDialog = (target?: ProgressNoteDialogTarget) =>
  renderWithProviders(
    <ProgressNoteDialog
      open
      onOpenChange={vi.fn()}
      onSubmit={vi.fn().mockResolvedValue(true)}
      target={target}
    />
  );

describe('ProgressNoteDialog', () => {
  it('renders the fallback add-note header when no target is provided', () => {
    renderDialog();

    expect(screen.getByRole('dialog', { name: 'Add a progress note' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Add a progress note' })).toBeInTheDocument();
  });

  it('renders target title and subtitle when a target is provided', () => {
    renderDialog({
      kind: 'coloring-page',
      title: 'Page 27',
      subtitle: 'Coloring · Secret Garden',
      thumbnailUrl: 'https://example.test/page-27.jpg',
    });

    expect(screen.getByText('Page 27')).toBeInTheDocument();
    expect(screen.getByText('Coloring · Secret Garden')).toBeInTheDocument();
    expect(screen.queryByText('Coloring page progress note')).not.toBeInTheDocument();
  });

  it('uses an action-plus-target accessible dialog name', () => {
    renderDialog({
      kind: 'diamond-project',
      title: 'Active Garden Kit',
      subtitle: 'Diamond painting · Studio Spark',
      thumbnailUrl: null,
    });

    expect(
      screen.getByRole('dialog', { name: 'Add progress note to Active Garden Kit' })
    ).toBeInTheDocument();
  });

  it('renders the craft fallback icon when thumbnailUrl is missing', () => {
    renderDialog({
      kind: 'coloring-page',
      title: 'Page 4',
      subtitle: 'Coloring · Active Florals',
      thumbnailUrl: null,
    });

    expect(screen.getByTestId('progress-note-target-coloring-page-fallback')).toBeInTheDocument();
  });
});
