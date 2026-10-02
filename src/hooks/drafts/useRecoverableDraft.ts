import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { POCKETBASE_URL } from '@/lib/pocketbaseConfig';
import { notify } from '@/lib/notifications';
import {
  getDraftGeneration,
  readFormDraft,
  registerDraftEditor,
  removeFormDraft,
  writeFormDraft,
  type DraftEnvelope,
  type DraftIdentity,
  type DraftKind,
} from './formDraftStorage';

interface RecoverableDraftOptions<T> {
  kind: DraftKind;
  ownerAccountId: string | null | undefined;
  recordId?: string;
  baseline: T | null;
  values: T | null;
  validate: (value: unknown) => value is T;
  onRestore: (values: T) => void;
  baselineUpdatedAt?: string;
}

type Decision<T> = {
  key: string;
  generation: string | null;
  draft: DraftEnvelope<T> | null;
  ready: boolean;
};

const checkpointDelay = 500;

export function useRecoverableDraft<T>({
  kind,
  ownerAccountId,
  recordId,
  baseline,
  values,
  validate,
  onRestore,
  baselineUpdatedAt,
}: RecoverableDraftOptions<T>) {
  const { user, initialCheckComplete } = useAuth();
  const baselineReady = baseline !== null;
  const identity = useMemo(
    () =>
      initialCheckComplete && user?.id && ownerAccountId === user.id && baselineReady
        ? { backendUrl: POCKETBASE_URL, accountId: user.id, kind, recordId }
        : null,
    [initialCheckComplete, user?.id, ownerAccountId, baselineReady, kind, recordId]
  );
  const key = identity
    ? `${identity.backendUrl}|${identity.accountId}|${kind}|${recordId ?? 'new'}`
    : '';
  const [decision, setDecision] = useState<Decision<T> | null>(null);
  const [storageFailed, setStorageFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<{
    identity: DraftIdentity;
    generation: string;
    values: T;
    baselineUpdatedAt?: string;
    dirty: boolean;
  } | null>(null);
  const retired = useRef(false);
  const ownsDraft = useRef(false);
  const restoreRef = useRef(onRestore);
  useEffect(() => {
    restoreRef.current = onRestore;
  }, [onRestore]);

  const cancelTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const flush = useCallback(() => {
    cancelTimer();
    const pending = latest.current;
    if (!pending || retired.current) return;
    if (!pending.dirty && !ownsDraft.current) return;
    const ok = pending.dirty
      ? writeFormDraft(
          pending.identity,
          pending.generation,
          pending.values,
          pending.baselineUpdatedAt
        )
      : removeFormDraft(pending.identity);
    if (ok) ownsDraft.current = pending.dirty;
    if (!ok) setStorageFailed(true);
  }, [cancelTimer]);

  useEffect(() => {
    if (!identity || decision?.key === key) return;
    flush();
    retired.current = false;
    ownsDraft.current = false;
    latest.current = null;
    cancelTimer();
    const generation = getDraftGeneration(identity);
    if (!generation) {
      setStorageFailed(true);
      setDecision({ key, generation: null, draft: null, ready: true });
      return;
    }
    const result = readFormDraft(identity, generation, validate);
    if (result.storageFailed) setStorageFailed(true);
    setDecision({ key, generation, draft: result.draft, ready: !result.draft });
  }, [identity, key, decision?.key, validate, cancelTimer, flush]);

  useEffect(() => {
    if (!identity || decision?.key !== key || !decision.generation) return;
    return registerDraftEditor(
      identity,
      decision.generation,
      () => {
        retired.current = true;
        ownsDraft.current = false;
        latest.current = null;
        cancelTimer();
      },
      flush,
      () => Boolean(latest.current?.dirty)
    );
  }, [identity, key, decision?.key, decision?.generation, cancelTimer, flush]);

  const pending = Boolean(
    (user?.id && ownerAccountId !== user.id) ||
    (identity && (decision?.key !== key || !decision.ready))
  );
  const dirty = Boolean(values && baseline && JSON.stringify(values) !== JSON.stringify(baseline));

  useEffect(() => {
    if (!identity) flush();
    if (!identity || !decision?.ready || decision.key !== key || !decision.generation || !values) {
      latest.current = null;
      cancelTimer();
      return;
    }
    if (retired.current) return;
    latest.current = {
      identity,
      generation: decision.generation,
      values,
      baselineUpdatedAt,
      dirty,
    };
    cancelTimer();
    timer.current = setTimeout(flush, checkpointDelay);
    return cancelTimer;
  }, [identity, key, decision, values, baselineUpdatedAt, dirty, flush, cancelTimer]);

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, [flush]);

  useEffect(() => () => flush(), [flush]);

  const restore = useCallback(() => {
    if (!decision?.draft || decision.key !== key) return;
    restoreRef.current(decision.draft.values);
    ownsDraft.current = true;
    setDecision(previous => previous && { ...previous, draft: null, ready: true });
  }, [decision, key]);

  const discard = useCallback(() => {
    if (!identity || decision?.key !== key) return;
    cancelTimer();
    latest.current = null;
    ownsDraft.current = false;
    if (!removeFormDraft(identity)) setStorageFailed(true);
    setDecision(previous => previous && { ...previous, draft: null, ready: true });
  }, [identity, key, decision?.key, cancelTimer]);

  const discardOnConfirmedLeave = useCallback(() => {
    retired.current = true;
    discard();
  }, [discard]);

  const saved = useCallback(() => {
    retired.current = true;
    latest.current = null;
    ownsDraft.current = false;
    cancelTimer();
    if (identity && !removeFormDraft(identity)) {
      setStorageFailed(true);
      notify({
        kind: 'warning',
        title: 'Saved, but local draft remains',
        description:
          'Saved to your account, but the old draft could not be cleared from this device. Check your library before using it.',
      });
    }
  }, [identity, cancelTimer]);

  return {
    pending,
    recoverable: decision?.key === key ? decision.draft : null,
    storageFailed,
    dirty,
    restore,
    discard,
    discardOnConfirmedLeave,
    checkpoint: flush,
    saved,
  };
}
