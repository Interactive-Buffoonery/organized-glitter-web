import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageLoading } from '../page-loading';

describe('PageLoading', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('does not mark the app ready or set data-app-ready', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    const overlay = document.createElement('div');
    overlay.id = 'app-loading';
    document.body.appendChild(overlay);
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    render(<PageLoading />, { container: root });

    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(root.getAttribute('data-app-ready')).toBeNull();
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('shows in-app recovery after 30s without reading data-app-ready', () => {
    const root = document.createElement('div');
    root.id = 'root';
    root.setAttribute('data-app-ready', 'true');
    document.body.appendChild(root);

    render(<PageLoading />, { container: root });

    expect(screen.getByRole('status')).toHaveTextContent('Loading…');

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    const heading = screen.getByRole('heading', { name: 'This is taking too long' });
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(heading).toHaveFocus();
    expect(heading).not.toHaveAttribute('role');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument();
    expect(root.getAttribute('data-app-ready')).toBe('true');
  });

  it('does not stack recovery when #app-error is already visible', () => {
    const root = document.createElement('div');
    root.id = 'root';
    root.setAttribute('data-app-ready', 'true');
    document.body.appendChild(root);
    const errorEl = document.createElement('div');
    errorEl.id = 'app-error';
    errorEl.style.display = 'flex';
    errorEl.setAttribute('aria-hidden', 'false');
    errorEl.innerHTML = '<button type="button" id="retry-button">Try again</button>';
    document.body.appendChild(errorEl);

    render(<PageLoading />, { container: root });

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(
      screen.queryByRole('heading', { name: 'This is taking too long' })
    ).not.toBeInTheDocument();
    expect(errorEl.style.display).toBe('flex');
  });

  it('does not stack recovery while the splash shell is still visible', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    const splash = document.createElement('div');
    splash.id = 'app-loading';
    document.body.appendChild(splash);

    render(<PageLoading />, { container: root });

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(
      screen.queryByRole('heading', { name: 'This is taking too long' })
    ).not.toBeInTheDocument();
  });
});
