import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useDirtyFormGuard } from '@/hooks/useDirtyFormGuard';

const Editor = ({ onDiscard }: { onDiscard: () => void }) => {
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const guard = useDirtyFormGuard({ isDirty: dirty, isSaving: saving, onDiscard });

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          guard.markChanged();
          setDirty(true);
        }}
      >
        Edit
      </button>
      <Link to="/other">Other page</Link>
      <button type="button" onClick={() => navigate(-1)}>
        Back
      </button>
      <button type="button" onClick={() => void guard.confirmDiscard(() => navigate('/other'))}>
        Cancel
      </button>
      <button
        type="button"
        onClick={() => {
          guard.allowLeave();
          navigate('/other');
        }}
      >
        Saved
      </button>
      <button type="button" onClick={guard.allowLeave}>
        Save confirmed
      </button>
      <button type="button" onClick={() => setSaving(true)}>
        Start saving
      </button>
      <button type="button" onClick={() => setSaving(false)}>
        Save failed
      </button>
    </div>
  );
};

describe('useDirtyFormGuard', () => {
  afterEach(() => vi.restoreAllMocks());

  const renderEditor = (onDiscard = vi.fn()) => {
    const router = createMemoryRouter(
      [
        { path: '/previous', element: <p>Previous page</p> },
        { path: '/edit', element: <Editor onDiscard={onDiscard} /> },
        { path: '/other', element: <p>Other page</p> },
      ],
      { initialEntries: ['/previous', '/edit'] }
    );
    render(<RouterProvider router={router} />);
    return { router, onDiscard };
  };

  it('blocks links and browser Back until discard is confirmed', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { router, onDiscard } = renderEditor();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('link', { name: 'Other page' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(router.state.location.pathname).toBe('/edit');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
    expect(router.state.location.pathname).toBe('/edit');
    expect(onDiscard).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/previous'));
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it('uses the same confirmation for Cancel and bypasses only after save', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { router, onDiscard } = renderEditor();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(router.state.location.pathname).toBe('/edit');
    expect(onDiscard).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Saved' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/other'));
    expect(confirm).toHaveBeenCalledOnce();
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it('rearms the guard if editing continues after a confirmed save', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { router } = renderEditor();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Save confirmed' }));
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('link', { name: 'Other page' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(router.state.location.pathname).toBe('/edit');
  });

  it('rejects route and explicit dismissal while saving, then protects a failed save', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { router, onDiscard } = renderEditor();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Start saving' }));

    await user.click(screen.getByRole('link', { name: 'Other page' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(router.state.location.pathname).toBe('/edit');
    expect(confirm).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Save failed' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(onDiscard).toHaveBeenCalledOnce();
    expect(router.state.location.pathname).toBe('/other');
  });
});
