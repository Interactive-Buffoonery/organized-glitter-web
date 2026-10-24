import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  captureSessionDrafts,
  clearSessionDrafts,
  completeSessionRecovery,
  ensureCurrentSessionAfterCreate,
  markSessionTokenInactive,
  peekCompletedSessionDestinations,
  recordCompletedSessionCreate,
  recordCompletedSessionFeedbackForAccount,
  registerSessionDraft,
  reportInvalidSession,
  retainSignedOutCreateTokens,
  subscribeToInvalidSession,
  takeCompletedSessionDestination,
  takeCompletedSessionFeedback,
  takeCompletedSessionOtherCreate,
  takeSessionDraft,
} from '../sessionRecovery';

afterEach(() => {
  clearSessionDrafts();
  localStorage.clear();
});

describe('session recovery', () => {
  it('captures an active draft before auth clears and restores it only for the same account', () => {
    const draft = { title: 'Unsent project', image: new File(['image'], 'cover.png') };
    const unregister = registerSessionDraft('/projects/new:diamond', 'account-a', () => draft);

    captureSessionDrafts('account-a', 'token-a');
    unregister();

    expect(takeSessionDraft('/projects/new:diamond', 'account-b')).toBeUndefined();
    expect(takeSessionDraft('/projects/new:diamond', 'account-a')).toBeUndefined();

    registerSessionDraft('/projects/new:diamond', 'account-a', () => draft);
    captureSessionDrafts('account-a', 'token-a');
    expect(takeSessionDraft('/projects/new:diamond', 'account-a')).toEqual(draft);
    expect(takeSessionDraft('/projects/new:diamond', 'account-a')).toBeUndefined();
  });

  it('reports the failed token once for concurrent invalid requests', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToInvalidSession(listener);

    reportInvalidSession('old-token');
    reportInvalidSession('old-token');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('old-token');
    unsubscribe();
  });

  it('discards the previous account draft when a different account signs in', () => {
    registerSessionDraft('project-edit:one:page', 'account-a', () => ({ title: 'Private draft' }));
    captureSessionDrafts('account-a', 'token-a');

    completeSessionRecovery('account-b');

    expect(takeSessionDraft('project-edit:one:page', 'account-a')).toBeUndefined();
  });

  it('reports a base record when recovery starts before its tag requests finish', () => {
    captureSessionDrafts('account-a', 'tag-token');
    markSessionTokenInactive('tag-token');

    expect(() => ensureCurrentSessionAfterCreate('tag-token', 'projects', 'record-2')).toThrowError(
      expect.objectContaining({ reason: 'session_changed' })
    );
    expect(takeCompletedSessionDestination('account-a')).toBe('/projects/record-2');
  });

  it('keeps a late create through a tab reload until its link is opened', async () => {
    retainSignedOutCreateTokens('account-a', ['durable-token']);
    recordCompletedSessionCreate('durable-token', 'projects', 'durable-project');

    vi.resetModules();
    const reloaded = await import('../sessionRecovery');
    expect(reloaded.peekCompletedSessionDestinations('account-a', '/projects/')).toEqual([
      '/projects/durable-project',
    ]);
    expect(reloaded.peekCompletedSessionDestinations('account-b', '/projects/')).toEqual([]);

    reloaded.acknowledgeCompletedSessionDestination('account-a', '/projects/durable-project');
    expect(reloaded.peekCompletedSessionDestinations('account-a', '/projects/')).toEqual([]);
    expect(peekCompletedSessionDestinations('account-a', '/projects/')).toEqual([]);
  });

  it('keeps separate creates written by two tabs', async () => {
    retainSignedOutCreateTokens('account-a', ['first-tab-token']);
    vi.resetModules();
    const otherTab = await import('../sessionRecovery');
    otherTab.retainSignedOutCreateTokens('account-a', ['second-tab-token']);

    recordCompletedSessionCreate('first-tab-token', 'projects', 'first-project');
    otherTab.recordCompletedSessionCreate('second-tab-token', 'projects', 'second-project');

    expect(peekCompletedSessionDestinations('account-a', '/projects/')).toEqual([
      '/projects/first-project',
      '/projects/second-project',
    ]);
    expect(
      Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter(
        key => key?.startsWith('og:completed-creates:v1:')
      )
    ).toHaveLength(2);
  });

  it('keeps a late non-project create tied to the departing account', () => {
    retainSignedOutCreateTokens('account-a', ['other-create-token']);
    recordCompletedSessionCreate('other-create-token', 'companies', 'company-1');

    expect(takeCompletedSessionOtherCreate('account-b')).toEqual([]);
    expect(takeCompletedSessionOtherCreate('account-a')).toEqual(['companies']);
    expect(takeCompletedSessionOtherCreate('account-a')).toEqual([]);
  });

  it('keeps completed feedback isolated across account recovery', () => {
    const feedbackA = {
      message: 'Delivered for account A',
      name: 'Account A',
      email: 'a@example.test',
    };
    const feedbackB = {
      message: 'Delivered for account B',
      name: 'Account B',
      email: 'b@example.test',
    };
    captureSessionDrafts('account-a', 'token-a');
    recordCompletedSessionFeedbackForAccount('account-a', feedbackA);

    completeSessionRecovery('account-b');
    recordCompletedSessionFeedbackForAccount('account-b', feedbackB);

    expect(takeCompletedSessionFeedback('account-a')).toEqual(feedbackA);
    expect(takeCompletedSessionFeedback('account-b')).toEqual(feedbackB);
  });
});
