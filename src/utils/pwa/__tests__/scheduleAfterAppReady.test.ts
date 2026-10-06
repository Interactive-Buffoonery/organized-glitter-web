import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleAfterAppReady } from '../scheduleAfterAppReady';

describe('PWA registration scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="root"></div>';
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });
  const ready = () => {
    document.getElementById('root')?.setAttribute('data-app-ready', 'true');
    window.dispatchEvent(new Event('app-loaded'));
  };

  it('does not start precaching during splash-only readiness or a hung route', () => {
    const register = vi.fn();
    const cancel = scheduleAfterAppReady(register);
    window.dispatchEvent(new Event('app-loaded'));
    vi.advanceTimersByTime(60_000);
    expect(register).not.toHaveBeenCalled();
    ready();
    vi.advanceTimersByTime(999);
    expect(register).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(register).toHaveBeenCalledTimes(1);
    cancel();
  });

  it('waits for idle with a bounded timeout after genuine readiness', () => {
    const register = vi.fn();
    const requestIdle = vi.fn();
    vi.stubGlobal('requestIdleCallback', requestIdle);
    const cancel = scheduleAfterAppReady(register);
    ready();
    ready();
    vi.advanceTimersByTime(1000);
    expect(requestIdle).toHaveBeenCalledTimes(1);
    expect(requestIdle).toHaveBeenCalledWith(expect.any(Function), { timeout: 2000 });
    expect(register).not.toHaveBeenCalled();
    requestIdle.mock.calls[0][0]();
    expect(register).toHaveBeenCalledTimes(1);
    cancel();
  });

  it('catches readiness that happened before registration mounted', () => {
    ready();
    const register = vi.fn();
    const cancel = scheduleAfterAppReady(register);
    vi.advanceTimersByTime(1000);
    expect(register).toHaveBeenCalledTimes(1);
    cancel();
  });

  it('cancels pending registration on unmount', () => {
    const register = vi.fn();
    const cancel = scheduleAfterAppReady(register);
    ready();
    cancel();
    vi.advanceTimersByTime(60_000);
    ready();
    expect(register).not.toHaveBeenCalled();
  });

  it('cancels an idle callback and ignores late delivery', () => {
    const register = vi.fn();
    const requestIdle = vi.fn().mockReturnValue(12);
    const cancelIdle = vi.fn();
    vi.stubGlobal('requestIdleCallback', requestIdle);
    vi.stubGlobal('cancelIdleCallback', cancelIdle);
    const cancel = scheduleAfterAppReady(register);
    ready();
    vi.advanceTimersByTime(1000);
    cancel();
    expect(cancelIdle).toHaveBeenCalledWith(12);
    requestIdle.mock.calls[0][0]();
    expect(register).not.toHaveBeenCalled();
  });
});
