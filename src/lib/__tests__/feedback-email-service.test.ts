import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deletionIntents } from '@/services/accountDeletion/intentStore';
import { POCKETBASE_URL } from '@/lib/pocketbaseConfig';
import type { DeletionIntent } from '@/services/accountDeletion/types';

const authState = vi.hoisted(() => ({
  accountId: 'account-a',
  isAuthenticated: true,
  isCurrentSession: true,
  token: 'session-token',
}));
vi.mock('@/services/accountDeletion/intentStore', () => ({
  deletionIntents: { get: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/services/auth', () => ({
  getAuthToken: () => (authState.isAuthenticated ? authState.token || null : null),
}));
vi.mock('@/lib/pocketbase', () => ({
  pb: {
    baseURL: 'https://data.example.test',
    authStore: {
      get token() {
        return authState.token;
      },
    },
  },
}));
vi.mock('@/services/auth/sessionIdentity', () => ({
  captureSessionIdentity: () => ({
    accountId: authState.accountId,
    generation: 1,
    epoch: 'request-epoch',
  }),
  isCurrentSessionIdentity: () => authState.isCurrentSession,
}));

const { sendFeedbackEmail } = await import('../feedback-email-service');
const { clearSessionDrafts, takeCompletedSessionFeedback } =
  await import('@/services/auth/sessionRecovery');

describe('sendFeedbackEmail', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  beforeEach(() => {
    authState.accountId = 'account-a';
    authState.isAuthenticated = true;
    authState.isCurrentSession = true;
    authState.token = 'session-token';
    clearSessionDrafts();
    vi.restoreAllMocks();
    vi.mocked(deletionIntents.get).mockReset().mockResolvedValue(undefined);
    vi.stubEnv('VITE_CONTACT_EMAIL', 'contact@example.test');
  });

  it('sends the session and reply email without client-supplied account identity', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', {
      ...window,
      location: {
        ...window.location,
        hostname: 'app.example.test',
      },
    });

    const result = await sendFeedbackEmail({
      message: 'This message is long enough to submit.',
      name: 'Sarah',
      email: 'contact@example.test',
    });

    expect(result).toEqual({
      success: true,
      emailId: 'feedback-api-sent',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://data.example.test/api/organized-glitter/feedback',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer session-token' },
        body: JSON.stringify({
          feedback: 'This message is long enough to submit.',
          email: 'contact@example.test',
          type: 'general',
        }),
      })
    );
  });

  // A late acceptance must survive deletion fences, storage loss, and account changes.
  it.each(['same session', 'another account', 'storage unavailable'])(
    'records accepted feedback for its original account with %s after dispatch',
    async boundary => {
      const fetchMock = vi.fn().mockImplementation(async () => {
        if (boundary === 'another account') {
          authState.accountId = 'account-b';
          authState.isCurrentSession = false;
        }
        if (boundary === 'storage unavailable') {
          vi.mocked(deletionIntents.get).mockRejectedValue(new Error('Storage unavailable'));
        } else {
          vi.mocked(deletionIntents.get).mockResolvedValue({ phase: 'pending' } as DeletionIntent);
        }
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      });
      const openMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      vi.stubGlobal('window', {
        ...window,
        location: { ...window.location, hostname: 'app.example.test' },
        open: openMock,
      });
      const feedback = {
        draftId: 'feedback-draft-a',
        message: 'Accepted feedback from the original account.',
        name: 'Sarah',
        email: 'contact@example.test',
      };

      await expect(sendFeedbackEmail(feedback)).resolves.toMatchObject({
        success: false,
        reason: 'session_changed',
      });
      expect(takeCompletedSessionFeedback('account-b')).toBeUndefined();
      expect(takeCompletedSessionFeedback('account-a')).toEqual(feedback);
      expect(takeCompletedSessionFeedback('account-a')).toBeUndefined();
      expect(deletionIntents.get).toHaveBeenLastCalledWith(POCKETBASE_URL, 'account-a');
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(openMock).not.toHaveBeenCalled();
    }
  );

  it('blocks feedback before dispatch when deletion is pending without opening a mail app', async () => {
    vi.mocked(deletionIntents.get).mockResolvedValue({ phase: 'pending' } as DeletionIntent);
    const fetchMock = vi.fn();
    const openMock = vi.fn();
    vi.stubGlobal('window', {
      ...window,
      location: { ...window.location, hostname: 'app.example.test' },
      open: openMock,
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      sendFeedbackEmail({ message: 'A valid feedback message.' })
    ).resolves.toMatchObject({
      success: false,
      reason: 'session_changed',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(openMock).not.toHaveBeenCalled();
  });

  it('keeps a rejected feedback response fenced without recording completion or opening mail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        vi.mocked(deletionIntents.get).mockResolvedValue({ phase: 'pending' } as DeletionIntent);
        return new Response(JSON.stringify({ error: 'Rejected' }), { status: 403 });
      })
    );
    const openMock = vi.fn();
    vi.stubGlobal('window', {
      ...window,
      location: { ...window.location, hostname: 'app.example.test' },
      open: openMock,
    });

    await expect(
      sendFeedbackEmail({ message: 'A valid feedback message.' })
    ).resolves.toMatchObject({
      success: false,
      reason: 'session_changed',
    });
    expect(takeCompletedSessionFeedback('account-a')).toBeUndefined();
    expect(openMock).not.toHaveBeenCalled();
  });

  it('requires a session without sending or opening a mail app', async () => {
    authState.isAuthenticated = false;
    authState.token = '';
    const fetchMock = vi.fn();
    const openMock = vi.spyOn(window, 'open').mockImplementation(() => null);
    vi.stubGlobal('fetch', fetchMock);
    expect(await sendFeedbackEmail({ message: 'A valid feedback message.' })).toMatchObject({
      success: false,
      reason: 'session_required',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(openMock).not.toHaveBeenCalled();
  });

  it('suppresses response errors after the originating session changes', async () => {
    let resolveResponse!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>(resolve => {
            resolveResponse = resolve;
          })
      )
    );
    const openMock = vi.fn();
    vi.stubGlobal('window', {
      ...window,
      location: { ...window.location, hostname: 'app.example.test' },
      open: openMock,
    });

    const resultPromise = sendFeedbackEmail({
      draftId: 'feedback-draft-a',
      message: 'Feedback rejected after the original session ended.',
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    authState.isCurrentSession = false;
    resolveResponse(
      new Response(JSON.stringify({ error: 'Please sign in again to send feedback.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(resultPromise).resolves.toMatchObject({
      success: false,
      reason: 'session_changed',
    });
    expect(takeCompletedSessionFeedback('account-a')).toBeUndefined();
    expect(openMock).not.toHaveBeenCalled();
  });
});
