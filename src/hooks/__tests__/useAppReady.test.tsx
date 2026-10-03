import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAppReady, useHideSplash } from '../useAppReady';

describe('useAppReady', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('dispatches app-loaded when ready and the splash overlay is visible', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    const overlay = document.createElement('div');
    overlay.id = 'app-loading';
    document.body.appendChild(overlay);

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    renderHook(() => useAppReady());

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy.mock.calls[0][0]).toBeInstanceOf(CustomEvent);
    expect((dispatchSpy.mock.calls[0][0] as CustomEvent).type).toBe('app-loaded');
    expect(root.getAttribute('data-app-ready')).toBe('true');
  });

  it('does not dispatch when ready is false', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    const overlay = document.createElement('div');
    overlay.id = 'app-loading';
    document.body.appendChild(overlay);

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    renderHook(() => useAppReady(false));

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(root.getAttribute('data-app-ready')).toBeNull();
  });

  it('dispatches once ready flips from false to true', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    const overlay = document.createElement('div');
    overlay.id = 'app-loading';
    document.body.appendChild(overlay);

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    const { rerender } = renderHook(({ ready }) => useAppReady(ready), {
      initialProps: { ready: false },
    });

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(root.getAttribute('data-app-ready')).toBeNull();

    rerender({ ready: true });

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect((dispatchSpy.mock.calls[0][0] as CustomEvent).type).toBe('app-loaded');
    expect(root.getAttribute('data-app-ready')).toBe('true');
  });

  it('marks #root ready even when the splash overlay is already gone', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    renderHook(() => useAppReady());

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(root.getAttribute('data-app-ready')).toBe('true');
  });

  it('does not dispatch when the splash overlay is already hidden', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    const overlay = document.createElement('div');
    overlay.id = 'app-loading';
    overlay.style.display = 'none';
    document.body.appendChild(overlay);

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    renderHook(() => useAppReady());

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(root.getAttribute('data-app-ready')).toBe('true');
  });

  it('dispatches app-loaded when splash is gone but #app-error is still present', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    const errorEl = document.createElement('div');
    errorEl.id = 'app-error';
    document.body.appendChild(errorEl);

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    renderHook(() => useAppReady());

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect((dispatchSpy.mock.calls[0][0] as CustomEvent).type).toBe('app-loaded');
    expect(root.getAttribute('data-app-ready')).toBe('true');
  });

  it('dispatches app-loaded when #app-error is showing even if the splash is gone', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    const errorEl = document.createElement('div');
    errorEl.id = 'app-error';
    errorEl.style.display = 'flex';
    errorEl.setAttribute('aria-hidden', 'false');
    document.body.appendChild(errorEl);

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    renderHook(() => useAppReady());

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect((dispatchSpy.mock.calls[0][0] as CustomEvent).type).toBe('app-loaded');
    expect(root.getAttribute('data-app-ready')).toBe('true');
  });
});

describe('useHideSplash', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('dispatches app-loaded without marking #root ready', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    const overlay = document.createElement('div');
    overlay.id = 'app-loading';
    document.body.appendChild(overlay);

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    renderHook(() => useHideSplash());

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect((dispatchSpy.mock.calls[0][0] as CustomEvent).type).toBe('app-loaded');
    expect(root.getAttribute('data-app-ready')).toBeNull();
  });

  it('does not dispatch when hide is false', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    const overlay = document.createElement('div');
    overlay.id = 'app-loading';
    document.body.appendChild(overlay);

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    renderHook(() => useHideSplash(false));

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(root.getAttribute('data-app-ready')).toBeNull();
  });

  it('does not dispatch after splash is gone even if #app-error remains', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    const errorEl = document.createElement('div');
    errorEl.id = 'app-error';
    document.body.appendChild(errorEl);

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    renderHook(() => useHideSplash());

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(root.getAttribute('data-app-ready')).toBeNull();
  });
});
