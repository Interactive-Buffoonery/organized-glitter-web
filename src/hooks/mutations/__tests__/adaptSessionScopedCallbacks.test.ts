import { describe, expect, it, vi } from 'vitest';

import { adaptSessionScopedCallbacks } from '@/hooks/mutations/adaptSessionScopedCallbacks';
import type { SessionIdentity } from '@/services/auth/sessionIdentity';

vi.mock('@/services/auth/sessionIdentity', () => ({
  isCurrentSessionIdentity: (identity: { current: boolean }) => identity.current,
}));

const select = (variables: { data: string }) => variables.data;

describe('adaptSessionScopedCallbacks', () => {
  it('wraps only the handlers the caller provided', () => {
    const adapted = adaptSessionScopedCallbacks({ onSuccess: vi.fn() }, select);

    expect(Object.keys(adapted ?? {})).toEqual(['onSuccess']);
    expect(adaptSessionScopedCallbacks({}, select)).toEqual({});
  });

  it('forwards selected variables only for the current session', () => {
    const onSuccess = vi.fn();
    const adapted = adaptSessionScopedCallbacks({ onSuccess }, select);
    const current = { current: true } as unknown as SessionIdentity;
    const stale = { current: false } as unknown as SessionIdentity;
    const mutationContext = {} as never;

    adapted?.onSuccess?.('ok', { data: 'a', sessionIdentity: stale }, undefined, mutationContext);
    adapted?.onSuccess?.('ok', { data: 'b', sessionIdentity: current }, undefined, mutationContext);

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith('ok', 'b', undefined, mutationContext);
  });
});
