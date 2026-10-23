import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { adaptSessionScopedCallbacks } from '@/hooks/mutations/adaptSessionScopedCallbacks';
import type { SessionIdentity } from '@/services/auth/sessionIdentity';

vi.mock('@/services/auth/sessionIdentity', () => ({
  isCurrentSessionIdentity: (identity: SessionIdentity) => identity.generation === 1,
}));

const select = (variables: { data: string }) => variables.data;

describe('adaptSessionScopedCallbacks', () => {
  it('preserves absent options and wraps only supplied handlers', () => {
    expect(adaptSessionScopedCallbacks(undefined, select)).toBeUndefined();
    expect(adaptSessionScopedCallbacks({}, select)).toEqual({});

    for (const handler of ['onSuccess', 'onError', 'onSettled'] as const) {
      const adapted = adaptSessionScopedCallbacks({ [handler]: vi.fn() }, select);
      expect(Object.keys(adapted ?? {})).toEqual([handler]);
    }
  });

  it.each(['onSuccess', 'onError', 'onSettled'] as const)(
    'guards %s and forwards its arguments and return value',
    handler => {
      const callbackResult = Promise.resolve();
      const callback = vi.fn(() => callbackResult);
      const selectVariables = vi.fn(select);
      const adapted = adaptSessionScopedCallbacks({ [handler]: callback }, selectVariables)!;
      const current: SessionIdentity = { accountId: 'account-a', generation: 1, epoch: 'epoch-a' };
      const stale: SessionIdentity = { ...current, generation: 0 };
      const context = { initiatingAccount: 'account-a' };
      const mutationContext = {
        client: new QueryClient(),
        meta: undefined,
        mutationKey: undefined,
      };
      const error = new Error('save failed');
      const invoke = (sessionIdentity: SessionIdentity) => {
        const variables = { data: 'input', sessionIdentity };
        if (handler === 'onSuccess')
          return adapted.onSuccess?.('saved', variables, context, mutationContext);
        if (handler === 'onError')
          return adapted.onError?.(error, variables, context, mutationContext);
        return adapted.onSettled?.('saved', error, variables, context, mutationContext);
      };

      expect(invoke(stale)).toBeUndefined();
      expect(callback).not.toHaveBeenCalled();
      expect(selectVariables).not.toHaveBeenCalled();

      expect(invoke(current)).toBe(callbackResult);
      expect(callback).toHaveBeenCalledExactlyOnceWith(
        ...(handler === 'onSettled'
          ? ['saved', error]
          : [handler === 'onSuccess' ? 'saved' : error]),
        'input',
        context,
        mutationContext
      );
      expect(selectVariables).toHaveBeenCalledExactlyOnceWith({
        data: 'input',
        sessionIdentity: current,
      });
    }
  );
});
