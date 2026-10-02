import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  captureSessionDrafts,
  clearSessionDrafts,
  completeSessionRecovery,
  registerSessionDraft,
  takeSessionDraft,
  reportInvalidSession,
  subscribeToInvalidSession,
  recordCompletedSessionCreate,
  takeCompletedSessionDestination,
  takeCompletedSessionDestinations,
  peekCompletedSessionDestinations,
  subscribeToCompletedSessionCreate,
  markSessionTokenInactive,
  isSessionTokenInactive,
  isSessionChangedError,
  SessionChangedError,
  ensureCurrentSessionAfterCreate,
  recordCompletedSessionFeedback,
  takeCompletedSessionFeedback,
  subscribeToCompletedSessionFeedback,
  retainSignedOutCreateTokens,
  takeCompletedSessionOtherCreate,
  subscribeToCompletedSessionOtherCreate,
} from '../sessionRecovery';

afterEach(() => {
  clearSessionDrafts();
  localStorage.clear();
});

describe('session recovery', () => {
  it('recognizes a session change wrapped by the service error handler', () => {
    expect(
      isSessionChangedError({
        type: 'server',
        message: 'Session changed',
        retryable: false,
        cause: new SessionChangedError(),
      })
    ).toBe(true);
    expect(
      isSessionChangedError({
        type: 'server',
        message: 'Session changed',
        retryable: false,
        cause: { originalError: new SessionChangedError() },
      })
    ).toBe(true);
  });

  it('captures an active draft before auth clears and restores it only for the same account', () => {
    const draft = { title: 'Unsent project', image: new File(['image'], 'cover.png') };
    const unregister = registerSessionDraft('/projects/new:diamond', () => draft);

    captureSessionDrafts('account-a', 'token-a');
    unregister();

    expect(takeSessionDraft('/projects/new:diamond', 'account-b')).toBeUndefined();
    expect(takeSessionDraft('/projects/new:diamond', 'account-a')).toBeUndefined();

    registerSessionDraft('/projects/new:diamond', () => draft);
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

  it('does not suppress recovery when expiry was noticed before a listener mounted', () => {
    reportInvalidSession('early-expired-token');
    const listener = vi.fn();
    const unsubscribe = subscribeToInvalidSession(listener);

    reportInvalidSession('early-expired-token');

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith('early-expired-token');
    unsubscribe();
  });

  it('discards the previous account draft when a different account signs in', () => {
    registerSessionDraft('project-edit:one:page', () => ({ title: 'Private draft' }));
    captureSessionDrafts('account-a', 'token-a');

    completeSessionRecovery('account-b');

    expect(takeSessionDraft('project-edit:one:page', 'account-a')).toBeUndefined();
  });

  it('keeps a create draft when a base record may still need tags', () => {
    registerSessionDraft('/projects/new:diamond', () => ({ title: 'Created' }));
    captureSessionDrafts('account-a', 'token-a');
    recordCompletedSessionCreate('token-a', 'projects', 'record-1');
    completeSessionRecovery('account-a');

    expect(takeSessionDraft('/projects/new:diamond', 'account-a')).toEqual({ title: 'Created' });
    expect(takeCompletedSessionDestination('account-a')).toBe('/projects/record-1');
    expect(takeCompletedSessionDestination('account-a')).toBeUndefined();
  });

  it('reports a base record when recovery starts before its tag requests finish', () => {
    captureSessionDrafts('account-a', 'tag-token');
    markSessionTokenInactive('tag-token');

    expect(() => ensureCurrentSessionAfterCreate('tag-token', 'projects', 'record-2')).toThrowError(
      expect.objectContaining({ reason: 'session_changed' })
    );
    expect(takeCompletedSessionDestination('account-a')).toBe('/projects/record-2');
  });

  it('keeps a signed-out late create through empty draft lookup', () => {
    retainSignedOutCreateTokens('account-a', ['signed-out-token']);
    recordCompletedSessionCreate('signed-out-token', 'coloring_books', 'book-1');

    expect(takeSessionDraft('book-form', 'account-a')).toBeUndefined();
    expect(takeCompletedSessionDestination('account-a')).toBe('/coloring/book-1');
  });

  it('keeps every late create for its account and form', () => {
    retainSignedOutCreateTokens('account-a', ['two-create-token']);
    recordCompletedSessionCreate('two-create-token', 'projects', 'project-1');
    recordCompletedSessionCreate('two-create-token', 'coloring_books', 'book-1');
    recordCompletedSessionCreate('two-create-token', 'projects', 'project-2');
    recordCompletedSessionCreate('two-create-token', 'projects', 'project-1');

    expect(takeCompletedSessionDestinations('account-b', '/projects/')).toEqual([]);
    expect(takeCompletedSessionDestinations('account-a', '/projects/')).toEqual([
      '/projects/project-1',
      '/projects/project-2',
    ]);
    expect(takeCompletedSessionDestinations('account-a', '/coloring/')).toEqual([
      '/coloring/book-1',
    ]);
  });

  it('keeps another account’s completed create through draft cleanup', () => {
    retainSignedOutCreateTokens('account-a', ['account-a-token']);
    recordCompletedSessionCreate('account-a-token', 'projects', 'project-a');
    captureSessionDrafts('account-b', 'account-b-token');

    clearSessionDrafts();

    expect(takeCompletedSessionDestination('account-a')).toBe('/projects/project-a');
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

  it('keeps tab-local links after browser storage recovers', () => {
    retainSignedOutCreateTokens('account-a', ['flaky-storage-token']);
    const originalSetItem = Storage.prototype.setItem;
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('Storage unavailable');
    });
    try {
      recordCompletedSessionCreate('flaky-storage-token', 'projects', 'project-1');
      write.mockImplementation(function (this: Storage, key, value) {
        originalSetItem.call(this, key, value);
      });
      recordCompletedSessionCreate('flaky-storage-token', 'projects', 'project-2');

      expect(peekCompletedSessionDestinations('account-a', '/projects/')).toEqual([
        '/projects/project-1',
        '/projects/project-2',
      ]);
    } finally {
      write.mockRestore();
    }
  });

  it('shows persisted links after a temporary storage read error', () => {
    retainSignedOutCreateTokens('account-a', ['read-error-token']);
    recordCompletedSessionCreate('read-error-token', 'projects', 'existing-project');
    const read = vi.spyOn(Storage.prototype, 'key').mockImplementationOnce(() => {
      throw new Error('Storage unavailable');
    });
    try {
      expect(peekCompletedSessionDestinations('account-a', '/projects/')).toEqual([
        '/projects/existing-project',
      ]);
      expect(peekCompletedSessionDestinations('account-a', '/projects/')).toEqual([
        '/projects/existing-project',
      ]);
    } finally {
      read.mockRestore();
    }
  });

  it('does not restore a link another tab opened during a storage outage', async () => {
    retainSignedOutCreateTokens('account-a', ['outage-token']);
    recordCompletedSessionCreate('outage-token', 'projects', 'opened-project');
    const originalSetItem = Storage.prototype.setItem;
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('Storage unavailable');
    });
    try {
      recordCompletedSessionCreate('outage-token', 'projects', 'pending-project');
      vi.resetModules();
      const otherTab = await import('../sessionRecovery');
      otherTab.acknowledgeCompletedSessionDestination('account-a', '/projects/opened-project');
      write.mockImplementation(function (this: Storage, key, value) {
        originalSetItem.call(this, key, value);
      });
      recordCompletedSessionCreate('outage-token', 'projects', 'new-project');

      expect(peekCompletedSessionDestinations('account-a', '/projects/')).toEqual([
        '/projects/pending-project',
        '/projects/new-project',
      ]);
    } finally {
      write.mockRestore();
    }
  });

  it('prunes old and excess completed links before storing another', () => {
    retainSignedOutCreateTokens('account-a', ['bounded-links-token']);
    recordCompletedSessionCreate('bounded-links-token', 'projects', 'expired-project');
    const expiredKey = Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index)
    ).find(key => key?.includes('expired-project'))!;
    localStorage.setItem(expiredKey, String(Date.now() - 31 * 24 * 60 * 60 * 1000));

    for (let index = 0; index < 101; index += 1) {
      recordCompletedSessionCreate('bounded-links-token', 'projects', `recent-${index}`);
    }

    const destinations = peekCompletedSessionDestinations('account-a', '/projects/');
    expect(destinations).toHaveLength(100);
    expect(destinations).not.toContain('/projects/expired-project');
    expect(destinations).not.toContain('/projects/recent-0');
    expect(destinations).toContain('/projects/recent-100');
    expect(localStorage.getItem(expiredKey)).toBeNull();
  });

  it('bounds tab-local links while browser storage remains unavailable', () => {
    retainSignedOutCreateTokens('outage-account', ['storage-outage-token']);
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    try {
      for (let index = 0; index < 105; index += 1) {
        recordCompletedSessionCreate('storage-outage-token', 'projects', `project-${index}`);
      }
      const destinations = peekCompletedSessionDestinations('outage-account', '/projects/');
      expect(destinations).toHaveLength(100);
      expect(destinations).not.toContain('/projects/project-0');
      expect(destinations).toContain('/projects/project-104');
    } finally {
      write.mockRestore();
    }
  });

  it('bounds retained account tokens without dropping recent late creates', () => {
    for (let index = 0; index < 130; index += 1) {
      retainSignedOutCreateTokens('account-a', [`retired-token-${index}`]);
    }
    recordCompletedSessionCreate('retired-token-0', 'projects', 'old-project');
    recordCompletedSessionCreate('retired-token-129', 'projects', 'recent-project');

    expect(peekCompletedSessionDestinations('account-a', '/projects/')).toEqual([
      '/projects/recent-project',
    ]);
  });

  it('reports another tab’s completed create through a storage event', async () => {
    const onCompleted = vi.fn();
    const unsubscribe = subscribeToCompletedSessionCreate(onCompleted);
    vi.resetModules();
    const otherTab = await import('../sessionRecovery');
    otherTab.retainSignedOutCreateTokens('account-a', ['remote-token']);
    otherTab.recordCompletedSessionCreate('remote-token', 'projects', 'remote-project');
    const key = Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index)
    ).find(value => value?.includes('remote-project'));

    window.dispatchEvent(new StorageEvent('storage', { key, newValue: '1' }));

    expect(onCompleted).toHaveBeenCalledWith('account-a', '/projects/remote-project');
    unsubscribe();
  });

  it('shows a new cross-tab link during a temporary storage read failure', async () => {
    const onCompleted = vi.fn();
    const unsubscribe = subscribeToCompletedSessionCreate(onCompleted);
    vi.resetModules();
    const otherTab = await import('../sessionRecovery');
    otherTab.retainSignedOutCreateTokens('remote-account', ['remote-outage-token']);
    otherTab.recordCompletedSessionCreate('remote-outage-token', 'projects', 'remote-outage');
    const key = Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index)
    ).find(value => value?.includes('remote-outage'));
    const read = vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    try {
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: String(Date.now()) }));
      expect(onCompleted).toHaveBeenCalledWith('remote-account', '/projects/remote-outage');
      expect(peekCompletedSessionDestinations('remote-account', '/projects/')).toEqual([
        '/projects/remote-outage',
      ]);
    } finally {
      read.mockRestore();
      unsubscribe();
    }
  });

  it('does not restore an opened link from a stale cross-tab write', () => {
    retainSignedOutCreateTokens('stale-account', ['stale-token']);
    recordCompletedSessionCreate('stale-token', 'projects', 'opened-link');
    const key = Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index)
    ).find(value => value?.includes('opened-link'));
    const unsubscribe = subscribeToCompletedSessionCreate(vi.fn());
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementationOnce(() => {
      throw new Error('Storage unavailable');
    });
    expect(takeCompletedSessionDestination('stale-account')).toBe('/projects/opened-link');
    remove.mockRestore();
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: String(Date.now()) }));
    const read = vi.spyOn(Storage.prototype, 'key').mockImplementationOnce(() => {
      throw new Error('Storage unavailable');
    });
    try {
      expect(peekCompletedSessionDestinations('stale-account', '/projects/')).toEqual([]);
    } finally {
      read.mockRestore();
      unsubscribe();
    }
  });

  it('keeps a late non-project create tied to the departing account', () => {
    retainSignedOutCreateTokens('account-a', ['other-create-token']);
    recordCompletedSessionCreate('other-create-token', 'companies', 'company-1');

    expect(takeCompletedSessionOtherCreate('account-b')).toEqual([]);
    expect(takeCompletedSessionOtherCreate('account-a')).toEqual(['companies']);
    expect(takeCompletedSessionOtherCreate('account-a')).toEqual([]);
  });

  it('keeps a non-project completion notice through reload', async () => {
    retainSignedOutCreateTokens('account-a', ['other-durable-token']);
    recordCompletedSessionCreate('other-durable-token', 'progress_notes', 'note-1');

    vi.resetModules();
    const reloaded = await import('../sessionRecovery');

    expect(reloaded.takeCompletedSessionOtherCreate('account-b')).toEqual([]);
    expect(reloaded.takeCompletedSessionOtherCreate('account-a')).toEqual(['progress_notes']);
    expect(reloaded.takeCompletedSessionOtherCreate('account-a')).toEqual([]);
  });

  it('retains each late collection across tabs until its notice is consumed', async () => {
    retainSignedOutCreateTokens('account-a', ['company-token']);
    recordCompletedSessionCreate('company-token', 'companies', 'company-1');
    vi.resetModules();
    const otherTab = await import('../sessionRecovery');
    otherTab.retainSignedOutCreateTokens('account-a', ['note-token']);
    otherTab.recordCompletedSessionCreate('note-token', 'progress_notes', 'note-1');

    expect(takeCompletedSessionOtherCreate('account-a')).toEqual(['companies', 'progress_notes']);
    expect(otherTab.takeCompletedSessionOtherCreate('account-a')).toEqual([]);
  });

  it('reports another tab’s non-project completion through a storage event', async () => {
    const onCompleted = vi.fn();
    const unsubscribe = subscribeToCompletedSessionOtherCreate(onCompleted);
    vi.resetModules();
    const otherTab = await import('../sessionRecovery');
    otherTab.retainSignedOutCreateTokens('account-a', ['other-remote-token']);
    otherTab.recordCompletedSessionCreate('other-remote-token', 'companies', 'company-1');
    const key = Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index)
    ).find(value => value?.startsWith('og:completed-other-create:v1:'));

    window.dispatchEvent(new StorageEvent('storage', { key, newValue: '1' }));

    expect(onCompleted).toHaveBeenCalledWith('account-a', 'companies');
    unsubscribe();
  });

  it('keeps a confirmed feedback draft available to match its late delivery', () => {
    registerSessionDraft('feedback-dialog', () => ({ message: 'Sent' }));
    captureSessionDrafts('account-a', 'token-a');
    recordCompletedSessionFeedback('token-a', {
      message: 'Sent',
      name: 'Anonymous User',
      email: '',
    });
    expect(takeSessionDraft('feedback-dialog', 'account-a')).toEqual({ message: 'Sent' });
  });

  it('reports a confirmed late create even after the draft was restored', () => {
    registerSessionDraft('/projects/new:diamond', () => ({ title: 'Created' }));
    captureSessionDrafts('account-a', 'token-a');
    completeSessionRecovery('account-a');
    expect(takeSessionDraft('/projects/new:diamond', 'account-a')).toEqual({ title: 'Created' });
    const onCompleted = vi.fn();
    const unsubscribe = subscribeToCompletedSessionCreate(onCompleted);

    recordCompletedSessionCreate('token-a', 'projects', 'record-1');

    expect(onCompleted).toHaveBeenCalledWith('account-a', '/projects/record-1');
    expect(takeCompletedSessionDestination('account-a')).toBe('/projects/record-1');
    unsubscribe();
  });

  it('keeps every inactive token guarded while old requests can finish', () => {
    for (let index = 0; index < 12; index += 1) markSessionTokenInactive(`token-${index}`);
    expect(isSessionTokenInactive('token-0')).toBe(true);
    expect(isSessionTokenInactive('token-11')).toBe(true);
  });

  it('reports confirmed feedback after its draft has already been restored', () => {
    registerSessionDraft('feedback-dialog', () => ({ message: 'Sent message' }));
    captureSessionDrafts('account-a', 'token-a');
    takeSessionDraft('feedback-dialog', 'account-a');
    completeSessionRecovery('account-a');
    const onCompleted = vi.fn();
    const unsubscribe = subscribeToCompletedSessionFeedback(onCompleted);

    const feedback = { message: 'Sent message', name: 'Anonymous User', email: '' };
    recordCompletedSessionFeedback('token-a', feedback);

    expect(onCompleted).toHaveBeenCalledWith('account-a', feedback);
    expect(takeCompletedSessionFeedback('account-a')).toEqual(feedback);
    expect(takeCompletedSessionFeedback('account-a')).toBeUndefined();
    unsubscribe();
  });
});
