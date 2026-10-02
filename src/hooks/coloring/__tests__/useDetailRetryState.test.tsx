import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDetailRetryState } from '../useDetailRetryState';

describe('useDetailRetryState', () => {
  it('ignores an old retry outcome after the route identity changes', async () => {
    let finishRetry: ((success: boolean) => void) | undefined;
    const action = () =>
      new Promise<boolean>(resolve => {
        finishRetry = resolve;
      });
    const { result, rerender } = renderHook(
      ({ identity }) => useDetailRetryState('coloring book', identity),
      { initialProps: { identity: 'book-a:route-1' } }
    );

    let retry: Promise<void> | undefined;
    act(() => {
      retry = result.current.retry(action);
    });
    expect(result.current.isRetrying).toBe(true);

    rerender({ identity: 'book-b:route-2' });
    expect(result.current.isRetrying).toBe(false);
    expect(result.current.announcement).toBe('');

    await act(async () => {
      finishRetry?.(false);
      await retry;
    });
    expect(result.current.announcement).toBe('');
  });
});
