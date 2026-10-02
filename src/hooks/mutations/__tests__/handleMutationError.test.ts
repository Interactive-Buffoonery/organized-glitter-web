import { describe, expect, it, vi } from 'vitest';
import { SessionChangedError } from '@/services/auth/sessionRecovery';
import { handleMutationError } from '../handleMutationError';

const notifyMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/notifications', () => ({ notify: notifyMock }));

describe('handleMutationError', () => {
  it('does not report a confirmed old-session save as failed', () => {
    notifyMock.mockClear();
    handleMutationError(
      {
        type: 'server',
        message: 'Session changed',
        retryable: false,
        cause: { originalError: new SessionChangedError() },
      },
      'add progress note'
    );

    expect(notifyMock).not.toHaveBeenCalled();
  });
});
