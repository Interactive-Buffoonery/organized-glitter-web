import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConnectionRecovery } from '@/hooks/useConnectionRecovery';

const CONNECTION_CHECK_ERROR = 'Still unable to connect. Please try again.';

const setOnline = (online: boolean) => {
  Object.defineProperty(window.navigator, 'onLine', {
    value: online,
    writable: true,
    configurable: true,
  });
};

const setOnlineSequence = (...values: boolean[]) => {
  const fallback = values.at(-1) ?? false;
  Object.defineProperty(window.navigator, 'onLine', {
    get: () => values.shift() ?? fallback,
    configurable: true,
  });
};

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
};

describe('useConnectionRecovery', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setOnline(false);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not block startup with a health check when the browser reports online', () => {
    setOnline(true);

    const { result } = renderHook(() => useConnectionRecovery());

    expect(result.current.state).toEqual({ status: 'online' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reconciles an offline change missed between render and effect subscription', () => {
    setOnlineSequence(true, false);

    const { result } = renderHook(() => useConnectionRecovery());

    expect(result.current.state).toEqual({ status: 'offline' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks the server when the browser comes online between render and effect subscription', async () => {
    const healthCheck = deferred<Response>();
    fetchMock.mockReturnValue(healthCheck.promise);
    setOnlineSequence(false, true);

    const { result } = renderHook(() => useConnectionRecovery());

    expect(result.current.state).toEqual({ status: 'checking' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/health$/),
      expect.objectContaining({ method: 'GET', cache: 'no-store' })
    );

    await act(async () => {
      healthCheck.resolve({ ok: true } as Response);
    });
    expect(result.current.state).toEqual({ status: 'online' });
  });

  it('keeps recovery active when an automatic reconnect check fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useConnectionRecovery());

    setOnline(true);
    act(() => window.dispatchEvent(new Event('online')));

    expect(result.current.state).toEqual({ status: 'checking' });
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'failed',
        message: CONNECTION_CHECK_ERROR,
      });
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('makes a bounded health request on an explicit check even when the browser still reports offline', async () => {
    fetchMock.mockResolvedValue({ ok: true } as Response);
    const { result } = renderHook(() => useConnectionRecovery());

    expect(result.current.state).toEqual({ status: 'offline' });

    act(() => result.current.checkConnection());

    expect(result.current.state).toEqual({ status: 'checking' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/health$/),
      expect.objectContaining({ method: 'GET', cache: 'no-store' })
    );

    await waitFor(() => expect(result.current.state).toEqual({ status: 'online' }));
  });

  it('recovers from an HTTP failure on a subsequent successful retry', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockResolvedValueOnce({ ok: true } as Response);
    const { result } = renderHook(() => useConnectionRecovery());
    setOnline(true);

    act(() => result.current.checkConnection());
    await waitFor(() => expect(result.current.state.status).toBe('failed'));

    act(() => result.current.checkConnection());
    await waitFor(() => expect(result.current.state).toEqual({ status: 'online' }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('times out a check and clears pending state before another attempt', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockReturnValueOnce(new Promise<Response>(() => undefined))
      .mockResolvedValueOnce({ ok: true } as Response);
    const { result } = renderHook(() => useConnectionRecovery());
    setOnline(true);

    act(() => result.current.checkConnection());
    expect(result.current.state).toEqual({ status: 'checking' });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(result.current.state).toEqual({
      status: 'failed',
      message: CONNECTION_CHECK_ERROR,
    });

    act(() => result.current.checkConnection());
    await act(async () => undefined);

    expect(result.current.state).toEqual({ status: 'online' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('coalesces repeated checks and ignores success from an invalidated attempt', async () => {
    const healthCheck = deferred<Response>();
    fetchMock.mockReturnValue(healthCheck.promise);
    const { result } = renderHook(() => useConnectionRecovery());
    setOnline(true);

    act(() => {
      result.current.checkConnection();
      result.current.checkConnection();
      window.dispatchEvent(new Event('online'));
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    setOnline(false);
    act(() => window.dispatchEvent(new Event('offline')));
    expect(result.current.state).toEqual({ status: 'offline' });

    await act(async () => {
      healthCheck.resolve({ ok: true } as Response);
    });

    expect(result.current.state).toEqual({ status: 'offline' });
  });

  it('aborts the request and clears its timeout on unmount', () => {
    vi.useFakeTimers();
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined));
    const { result, unmount } = renderHook(() => useConnectionRecovery());
    setOnline(true);

    act(() => result.current.checkConnection());
    const signal = (fetchMock.mock.calls[0]?.[1] as RequestInit).signal;

    expect(signal?.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    window.dispatchEvent(new Event('online'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
