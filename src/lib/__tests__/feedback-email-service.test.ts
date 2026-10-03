import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  isAuthenticated: true,
  token: 'session-token',
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

const { sendFeedbackEmail } = await import('../feedback-email-service');

describe('sendFeedbackEmail', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  beforeEach(() => {
    authState.isAuthenticated = true;
    authState.token = 'session-token';
    vi.restoreAllMocks();
    vi.stubEnv('VITE_CONTACT_EMAIL', 'contact@example.test');
  });

  it('does not open mailto fallback for short validation errors', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    const result = await sendFeedbackEmail({
      message: 'short',
      name: 'Sarah',
      email: 'sarah@example.test',
    });

    expect(result).toEqual({
      success: false,
      error: 'Message must be at least 10 characters long',
    });
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('validates and sends a padded 5,000-character message consistently', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', {
      ...window,
      location: { ...window.location, hostname: 'app.example.test' },
    });

    const result = await sendFeedbackEmail({ message: `  ${'a'.repeat(5000)}  ` });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://data.example.test/api/organized-glitter/feedback',
      expect.objectContaining({
        body: JSON.stringify({ feedback: 'a'.repeat(5000), type: 'general' }),
      })
    );
  });

  it('does not open mailto fallback for invalid email validation errors', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    const result = await sendFeedbackEmail({
      message: 'This message is long enough to submit.',
      name: 'Sarah',
      email: 'not-an-email',
    });

    expect(result).toEqual({
      success: false,
      error: 'Invalid email format',
    });
    expect(openSpy).not.toHaveBeenCalled();
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

  it('leaves reply email blank when an authenticated user leaves the email field blank', async () => {
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
      email: '',
    });

    expect(result).toEqual({
      success: true,
      emailId: 'feedback-api-sent',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://data.example.test/api/organized-glitter/feedback',
      expect.objectContaining({
        body: JSON.stringify({
          feedback: 'This message is long enough to submit.',
          email: '',
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

  it('keeps an expired-session error in the form instead of opening mail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Please sign in again to send feedback.' }), {
          status: 401,
        })
      )
    );
    const openMock = vi.fn();
    vi.stubGlobal('window', {
      ...window,
      location: { ...window.location, hostname: 'app.example.test' },
      open: openMock,
    });
    expect(await sendFeedbackEmail({ message: 'A valid feedback message.' })).toMatchObject({
      success: false,
      reason: 'session_required',
    });
    expect(openMock).not.toHaveBeenCalled();
  });

  it('returns an account rate-limit reason without opening the mailto fallback', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: () =>
        Promise.resolve({
          error: 'Too many requests. Please try again later.',
          reason: 'rate_limited',
          retryAfter: 120,
        }),
    });
    const openMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', {
      ...window,
      location: {
        ...window.location,
        hostname: 'app.example.test',
      },
      open: openMock,
    });

    const result = await sendFeedbackEmail({
      message: 'This message is long enough to submit.',
      name: 'Sarah',
      email: 'sarah@example.test',
    });

    expect(result).toMatchObject({
      success: false,
      reason: 'rate_limited',
    });
    expect(openMock).not.toHaveBeenCalled();
  });

  it('shows verification overload as a service error instead of an account rate limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'Feedback is temporarily busy. Please try again shortly.',
            reason: 'verification_busy',
            retryAfter: 60,
          }),
          { status: 503 }
        )
      )
    );
    const openMock = vi.spyOn(window, 'open').mockImplementation(() => null);
    vi.stubGlobal('window', {
      ...window,
      location: { ...window.location, hostname: 'app.example.test' },
      open: openMock,
    });

    expect(await sendFeedbackEmail({ message: 'A valid feedback message.' })).toMatchObject({
      success: false,
      reason: 'verification_busy',
    });
    expect(openMock).not.toHaveBeenCalled();
  });

  it('does not open mailto fallback for non-JSON server errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: () => Promise.reject(new SyntaxError('Unexpected token <')),
    });
    const openMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', {
      ...window,
      location: {
        ...window.location,
        hostname: 'app.example.test',
      },
      open: openMock,
    });

    const result = await sendFeedbackEmail({
      message: 'This message is long enough to submit.',
      name: 'Sarah',
      email: 'sarah@example.test',
    });

    expect(result).toEqual({
      success: false,
      error: 'HTTP 502: Bad Gateway',
    });
    expect(openMock).not.toHaveBeenCalled();
  });

  it('does not report delivery when a non-JSON success response opens no mail client', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.reject(new SyntaxError('Unexpected token <')),
    });
    const openMock = vi.fn().mockReturnValue(null);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', {
      ...window,
      location: {
        ...window.location,
        hostname: 'app.example.test',
      },
      open: openMock,
    });

    const result = await sendFeedbackEmail({
      message: 'This message is long enough to submit.',
      name: 'Sarah',
      email: 'sarah@example.test',
    });

    expect(result).toEqual({
      success: false,
      error:
        "We couldn't send your feedback here. If your email app opened, send the prepared message from there. If it didn't open, email us directly at contact@example.test.",
      reason: 'mailto_fallback',
    });
    expect(openMock).toHaveBeenCalledOnce();
  });

  it('does not report delivery when a method error attempts the mailto fallback', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 405,
      statusText: 'Method Not Allowed',
      json: () => Promise.reject(new SyntaxError('Unexpected token M')),
    });
    const openMock = vi.fn().mockReturnValue({});
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', {
      ...window,
      location: {
        ...window.location,
        hostname: 'app.example.test',
      },
      open: openMock,
    });

    const result = await sendFeedbackEmail({
      message: 'This message is long enough to submit.',
      name: 'Sarah',
      email: 'sarah@example.test',
    });

    expect(result).toEqual({
      success: false,
      error:
        "We couldn't send your feedback here. If your email app opened, send the prepared message from there. If it didn't open, email us directly at contact@example.test.",
      reason: 'mailto_fallback',
    });
    expect(openMock).toHaveBeenCalledOnce();
  });
});
