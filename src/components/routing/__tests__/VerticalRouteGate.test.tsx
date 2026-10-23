import '@testing-library/jest-dom/vitest';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const { useAppReadyMock, useHideSplashMock, authState, enabledVerticalsState } = vi.hoisted(() => ({
  useAppReadyMock: vi.fn(),
  useHideSplashMock: vi.fn(),
  authState: {
    user: { id: 'user-123' } as { id: string } | null,
  },
  enabledVerticalsState: {
    diamond_painting: true,
    coloring_books: true,
    isLoading: true,
  },
}));

vi.mock('@/hooks/useAppReady', () => ({
  useAppReady: (...args: unknown[]) => useAppReadyMock(...args),
  useHideSplash: (...args: unknown[]) => useHideSplashMock(...args),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

vi.mock('@/hooks/useEnabledVerticals', () => ({
  useEnabledVerticals: () => enabledVerticalsState,
}));

import { VerticalRouteGate } from '../AppRoutes';

function DraftEditor() {
  const [draft, setDraft] = useState('');
  return (
    <input aria-label="Draft" value={draft} onChange={event => setDraft(event.target.value)} />
  );
}

function GateWithNavigation() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate('/coloring/other/edit')}>
        Another editor
      </button>
      <VerticalRouteGate requiredVertical="coloring_books">
        <DraftEditor />
      </VerticalRouteGate>
    </>
  );
}

describe('VerticalRouteGate admission', () => {
  beforeEach(() => {
    authState.user = { id: 'user-123' };
    enabledVerticalsState.diamond_painting = true;
    enabledVerticalsState.coloring_books = true;
    enabledVerticalsState.isLoading = false;
  });

  it('keeps a mounted draft when a background refresh disables its tracker', () => {
    const view = render(
      <MemoryRouter>
        <GateWithNavigation />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Draft' }), {
      target: { value: 'Unsaved note' },
    });
    enabledVerticalsState.coloring_books = false;
    view.rerender(
      <MemoryRouter>
        <GateWithNavigation />
      </MemoryRouter>
    );
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('Unsaved note');
  });

  it('reevaluates access when the account changes', () => {
    const view = render(
      <MemoryRouter>
        <GateWithNavigation />
      </MemoryRouter>
    );
    enabledVerticalsState.coloring_books = false;
    authState.user = { id: 'another-user' };
    view.rerender(
      <MemoryRouter>
        <GateWithNavigation />
      </MemoryRouter>
    );
    expect(screen.queryByRole('textbox', { name: 'Draft' })).not.toBeInTheDocument();
  });

  it('rejects an initially disabled tracker', () => {
    enabledVerticalsState.coloring_books = false;
    render(
      <MemoryRouter>
        <GateWithNavigation />
      </MemoryRouter>
    );
    expect(screen.queryByRole('textbox', { name: 'Draft' })).not.toBeInTheDocument();
  });
});
