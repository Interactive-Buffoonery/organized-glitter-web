import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
