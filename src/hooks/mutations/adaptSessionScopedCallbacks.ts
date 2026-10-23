import type { MutateOptions } from '@tanstack/react-query';

import { isCurrentSessionIdentity, type SessionIdentity } from '@/services/auth/sessionIdentity';

interface SessionScopedVariables {
  sessionIdentity: SessionIdentity;
}

export function adaptSessionScopedCallbacks<
  TData,
  TError,
  TVariables,
  TInnerVariables extends SessionScopedVariables,
  TOnMutateResult,
>(
  options: MutateOptions<TData, TError, TVariables, TOnMutateResult> | undefined,
  selectVariables: (variables: TInnerVariables) => TVariables
): MutateOptions<TData, TError, TInnerVariables, TOnMutateResult> | undefined {
  if (!options) return undefined;

  const { onSuccess, onError, onSettled } = options;

  return {
    ...(onSuccess && {
      onSuccess: (data, variables, context, mutationContext) => {
        if (!isCurrentSessionIdentity(variables.sessionIdentity)) return;
        return onSuccess(data, selectVariables(variables), context, mutationContext);
      },
    }),
    ...(onError && {
      onError: (error, variables, context, mutationContext) => {
        if (!isCurrentSessionIdentity(variables.sessionIdentity)) return;
        return onError(error, selectVariables(variables), context, mutationContext);
      },
    }),
    ...(onSettled && {
      onSettled: (data, error, variables, context, mutationContext) => {
        if (!isCurrentSessionIdentity(variables.sessionIdentity)) return;
        return onSettled(data, error, selectVariables(variables), context, mutationContext);
      },
    }),
  };
}
