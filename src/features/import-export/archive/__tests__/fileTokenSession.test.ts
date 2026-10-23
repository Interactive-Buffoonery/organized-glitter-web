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
