import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createFileTokenSession,
  FILE_TOKEN_REFRESH_AFTER_MS,
} from '@/features/import-export/archive/fileTokenSession';

describe('createFileTokenSession', () => {
  const requestToken = vi.fn();
  let nowMs = 0;

  beforeEach(() => {
    nowMs = 1_000;
    requestToken.mockReset();
    requestToken.mockResolvedValue('next-token');
  });

  it('reuses the current token until the refresh window elapses', async () => {
    const session = createFileTokenSession('initial-token', {
      now: () => nowMs,
      requestToken,
    });

    await expect(session.current()).resolves.toBe('initial-token');
    nowMs += FILE_TOKEN_REFRESH_AFTER_MS - 1;
    await expect(session.current()).resolves.toBe('initial-token');
    expect(requestToken).not.toHaveBeenCalled();
  });

  it('refreshes once when concurrent callers observe an expired token', async () => {
    let resolveRefresh: (token: string) => void = () => {};
    requestToken.mockImplementation(
      () =>
        new Promise<string>(resolve => {
          resolveRefresh = resolve;
        })
    );
    const session = createFileTokenSession('initial-token', {
      now: () => nowMs,
      requestToken,
    });

    nowMs += FILE_TOKEN_REFRESH_AFTER_MS;
    const first = session.current();
    const second = session.current();
    expect(requestToken).toHaveBeenCalledTimes(1);
    resolveRefresh('rotated-token');
    await expect(first).resolves.toBe('rotated-token');
    await expect(second).resolves.toBe('rotated-token');
    expect(requestToken).toHaveBeenCalledTimes(1);
  });
});
