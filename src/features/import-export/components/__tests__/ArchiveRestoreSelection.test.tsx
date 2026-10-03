import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MultipartRestorePanel } from '../ArchiveRestoreSelection';

const first = new File(['a'], 'part-1.zip', { type: 'application/zip' });
const second = new File(['b'], 'part-2.zip', { type: 'application/zip' });

function props() {
  return {
    files: [] as File[],
    selectedFiles: [] as File[],
    onFilesChange: vi.fn(),
    onSelectedFilesChange: vi.fn(),
    onRestore: vi.fn(),
  };
}

describe('multipart archive restore selection', () => {
  it('focuses a newly reported restore failure', () => {
    const handlers = props();
    const { rerender } = render(<MultipartRestorePanel {...handlers} error={null} />);

    rerender(<MultipartRestorePanel {...handlers} error="Restore failed at part 2" />);
    expect(screen.getByRole('heading', { name: 'Restore failed' })).toHaveFocus();
  });

  it('waits for the app root to become interactive before focusing a restore failure', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    root.setAttribute('inert', '');
    document.body.append(root);
    try {
      const handlers = props();
      const { rerender } = render(<MultipartRestorePanel {...handlers} error={null} />, {
        container: root,
      });

      rerender(<MultipartRestorePanel {...handlers} error="Restore failed at part 2" />);
      const heading = screen.getByRole('heading', { name: 'Restore failed', hidden: true });
      expect(heading).not.toHaveFocus();

      root.removeAttribute('inert');
      await waitFor(() => expect(heading).toHaveFocus());
    } finally {
      root.remove();
    }
  });

  it('keeps waiting for focus when the restore error changes while the app root is inert', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    root.setAttribute('inert', '');
    document.body.append(root);
    try {
      const handlers = props();
      const { rerender, unmount } = render(<MultipartRestorePanel {...handlers} error={null} />, {
        container: root,
      });

      rerender(<MultipartRestorePanel {...handlers} error="Restore failed at part 1" />);
      rerender(<MultipartRestorePanel {...handlers} error="Restore failed at part 2" />);
      const heading = screen.getByRole('heading', { name: 'Restore failed', hidden: true });
      expect(heading).not.toHaveFocus();

      root.removeAttribute('inert');
      await waitFor(() => expect(heading).toHaveFocus());
      unmount();
    } finally {
      root.remove();
    }
  });

  it('accepts multiple ZIPs and retries the retained selection after a failure', () => {
    const handlers = props();
    const { rerender } = render(<MultipartRestorePanel {...handlers} />);
    fireEvent.change(screen.getByLabelText('Archive ZIP file'), {
      target: { files: [first, second] },
    });
    expect(handlers.onFilesChange).toHaveBeenCalledWith([first, second]);

    rerender(
      <MultipartRestorePanel
        {...handlers}
        files={[first, second]}
        selectedFiles={[first, second]}
        error="Backup parts disagree"
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Backup parts disagree');
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Import archive' }));
    expect(handlers.onRestore).toHaveBeenCalledTimes(1);
  });

  it('can select one part independently and reports only the selected portion', () => {
    const handlers = props();
    render(
      <MultipartRestorePanel
        {...handlers}
        files={[first, second]}
        selectedFiles={[second]}
        result={{
          success: true,
          selectedPartNumbers: [2],
          missingPartNumbers: [1],
          selectedPartCount: 1,
          totalPartCount: 2,
          selectedLogicalItemCount: 1,
          createdItemCount: 1,
          scaffoldedItemCount: 0,
          alreadyAppliedItemCount: 2,
          restoredAssetCount: 1,
          alreadyAppliedAssetCount: 3,
          conflicts: [],
          errors: [],
        }}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('selected Part 2');
    expect(screen.getByRole('alert')).toHaveTextContent('Missing Part 1');
    expect(screen.getByRole('alert')).toHaveTextContent(
      '2 items and 3 assets were already applied'
    );
    expect(screen.getByRole('checkbox', { name: 'Select part-1.zip' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select part-2.zip' })).toBeChecked();
  });

  it('shows partial writes, conflicts, cancellation, and disables mutation controls while busy', () => {
    const handlers = props();
    render(
      <MultipartRestorePanel
        {...handlers}
        files={[first]}
        selectedFiles={[first]}
        busy
        progress={{ phase: 'restore', completed: 1, total: 2, partNumber: 1 }}
        onCancel={vi.fn()}
        result={{
          success: false,
          selectedPartNumbers: [1],
          missingPartNumbers: [],
          selectedPartCount: 1,
          totalPartCount: 1,
          selectedLogicalItemCount: 2,
          createdItemCount: 1,
          scaffoldedItemCount: 0,
          alreadyAppliedItemCount: 0,
          restoredAssetCount: 1,
          alreadyAppliedAssetCount: 0,
          conflicts: [
            {
              partNumber: 1,
              itemId: 'item-2',
              message: 'Changed in this account',
            },
          ],
          errors: [{ partNumber: 1, itemId: 'item-3', message: 'Cancelled' }],
        }}
      />
    );
    expect(screen.getByRole('button', { name: 'Import archive' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel restore' })).toBeEnabled();
    expect(screen.getByRole('alert')).toHaveTextContent('1 new item');
    expect(screen.getByRole('alert')).toHaveTextContent('item-2: Changed in this account');
    expect(screen.getByRole('alert')).toHaveTextContent('item-3: Cancelled');
    expect(screen.getByText(/Restoring archive data/)).toBeInTheDocument();
  });
});
