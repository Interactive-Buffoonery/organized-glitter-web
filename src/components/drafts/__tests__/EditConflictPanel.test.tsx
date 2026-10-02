import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EditConflictPanel } from '../EditConflictPanel';

describe('EditConflictPanel', () => {
  it('moves visible focus to a full-page conflict after a failed save', () => {
    Element.prototype.scrollIntoView = vi.fn();
    render(
      <EditConflictPanel
        itemName="project"
        detailPath="/projects/project-123"
        onUseLatest={async () => true}
        focusOnMount
      />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveFocus();
    expect(alert).toHaveAttribute('tabindex', '-1');
    expect(alert).toHaveClass('focus-visible:ring-2');
    expect(alert.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'auto' });
  });

  it('waits for the app root to become interactive before focusing a page conflict', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const root = document.createElement('div');
    root.id = 'root';
    root.setAttribute('inert', '');
    document.body.append(root);
    const { unmount } = render(
      <EditConflictPanel
        itemName="project"
        detailPath="/projects/project-123"
        onUseLatest={async () => true}
        focusOnMount
      />,
      { container: root }
    );

    const alert = screen.getByRole('alert');
    expect(alert).not.toHaveFocus();
    expect(alert.scrollIntoView).not.toHaveBeenCalled();
    root.removeAttribute('inert');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(alert.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'auto' });
    unmount();
    root.remove();
  });

  it('invokes the recovery action without owning Save focus', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const user = userEvent.setup();
    const onUseLatest = vi.fn(async () => true);
    render(
      <EditConflictPanel
        itemName="project"
        detailPath="/projects/project-123"
        onUseLatest={onUseLatest}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Keep my edits for a new save' }));
    expect(onUseLatest).toHaveBeenCalledOnce();
  });
});
