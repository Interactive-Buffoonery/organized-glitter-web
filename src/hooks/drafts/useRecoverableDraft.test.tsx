import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { StrictMode } from 'react';

import {
  getDraftGeneration,
  readFormDraft,
  writeFormDraft,
  type DraftIdentity,
} from './formDraftStorage';
import { useRecoverableDraft } from './useRecoverableDraft';

const { authState } = vi.hoisted(() => ({
  authState: { user: { id: 'account-a' }, initialCheckComplete: true },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));
vi.mock('@/lib/pocketbaseConfig', () => ({ POCKETBASE_URL: 'https://draft.example.test' }));
vi.mock('@/lib/notifications', () => ({ notify: vi.fn() }));

const identity: DraftIdentity = {
  backendUrl: 'https://draft.example.test',
  accountId: 'account-a',
  kind: 'project-new',
};
const baseline = { title: '' };
const validate = (value: unknown): value is { title: string } =>
  !!value && typeof value === 'object' && typeof (value as { title?: unknown }).title === 'string';
const onRestore = vi.fn();

const useDraft = (values: { title: string }, ownerAccountId = 'account-a') =>
  useRecoverableDraft({
    kind: 'project-new',
    ownerAccountId,
    baseline,
    values,
    validate,
    onRestore,
  });

beforeEach(() => {
  localStorage.clear();
  authState.user = { id: 'account-a' };
  onRestore.mockReset();
  vi.useRealTimers();
});

describe('useRecoverableDraft', () => {
  it('holds a stored draft until restore or discard and never overwrites it with defaults', async () => {
    const generation = getDraftGeneration(identity)!;
    writeFormDraft(identity, generation, { title: 'Saved text' });
    const { result } = renderHook(() => useDraft(baseline));

    expect(result.current.pending).toBe(true);
    expect(result.current.recoverable?.values.title).toBe('Saved text');
    expect(readFormDraft(identity, generation, validate).draft?.values.title).toBe('Saved text');
    act(() => result.current.restore());
    expect(onRestore).toHaveBeenCalledWith({ title: 'Saved text' });
    expect(result.current.pending).toBe(false);
  });

  it('starts a new checkpoint after the user discards the old draft', async () => {
    const generation = getDraftGeneration(identity)!;
    writeFormDraft(identity, generation, { title: 'Old text' });
    const { result, rerender } = renderHook(({ values }) => useDraft(values), {
      initialProps: { values: baseline },
    });
    act(() => result.current.discard());
    expect(readFormDraft(identity, generation, validate).draft).toBeNull();

    vi.useFakeTimers();
    rerender({ values: { title: 'New text' } });
    act(() => vi.advanceTimersByTime(600));
    expect(readFormDraft(identity, generation, validate).draft?.values.title).toBe('New text');
  });

  it('does not let an untouched second tab erase another editor’s checkpoint', () => {
    vi.useFakeTimers();
    const generation = getDraftGeneration(identity)!;
    const first = renderHook(() => useDraft({ title: 'First tab text' }));
    act(() => vi.advanceTimersByTime(200));
    const second = renderHook(() => useDraft(baseline));

    act(() => vi.advanceTimersByTime(600));

    expect(readFormDraft(identity, generation, validate).draft?.values.title).toBe(
      'First tab text'
    );
    first.unmount();
    second.unmount();
  });

  it('cannot recreate a confirmed draft from a pending timer', () => {
    const generation = getDraftGeneration(identity)!;
    const { result, rerender } = renderHook(({ values }) => useDraft(values), {
      initialProps: { values: baseline },
    });
    vi.useFakeTimers();
    rerender({ values: { title: 'Already saved' } });
    act(() => result.current.saved());
    act(() => vi.advanceTimersByTime(600));
    expect(readFormDraft(identity, generation, validate).draft).toBeNull();
  });

  it('does not write an account A form into account B after auth changes', () => {
    const { result, rerender } = renderHook(({ values }) => useDraft(values), {
      initialProps: { values: { title: 'Private A text' } },
    });
    authState.user = { id: 'account-b' };
    rerender({ values: { title: 'Private A text' } });
    expect(result.current.pending).toBe(true);
    const bIdentity = { ...identity, accountId: 'account-b' };
    const bGeneration = getDraftGeneration(bIdentity)!;
    expect(readFormDraft(bIdentity, bGeneration, validate).draft).toBeNull();
  });

  it('keeps writing after Strict Mode effect cleanup and setup', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const generation = getDraftGeneration(identity)!;
    const { rerender } = renderHook(({ values }) => useDraft(values), {
      wrapper,
      initialProps: { values: baseline },
    });
    vi.useFakeTimers();
    rerender({ values: { title: 'After setup' } });
    act(() => vi.advanceTimersByTime(600));
    expect(readFormDraft(identity, generation, validate).draft?.values.title).toBe('After setup');
  });
});
