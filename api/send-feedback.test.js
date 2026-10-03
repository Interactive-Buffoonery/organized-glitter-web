import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();

vi.mock('resend', () => ({
  Resend: vi.fn(function Resend() {
    return {
      emails: {
        send: sendMock,
      },
    };
  }),
}));

const { default: handler } = await import('./send-feedback.js');

const makeReq = (body, origin = 'http://localhost:5173') => ({
  method: 'POST',
  headers: {
    origin,
  },
  body,
});

const makeRes = () => {
  const res = {
    headers: {},
    statusCode: 200,
    body: undefined,
    setHeader: vi.fn((key, value) => {
      res.headers[key] = value;
    }),
    status: vi.fn(code => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn(payload => {
      res.body = payload;
      return res;
    }),
    end: vi.fn(() => res),
  };

  return res;
};

const feedbackBody = {
  feedback: 'The randomizer broke after I clicked the button.',
  email: 'sarah@example.test',
  accountEmail: 'account@example.test',
  type: 'bug',
  userId: 'user_secret_123',
};

const flattenLoggedValues = mock =>
  mock.mock.calls
    .flatMap(call => call)
    .map(value => (typeof value === 'string' ? value : JSON.stringify(value)))
    .join('\n');

const configureFeedbackEnv = () => {
  process.env.RESEND_API_KEY = 'test_resend_key';
  process.env.FEEDBACK_FROM_EMAIL = 'feedback@example.test';
  process.env.FEEDBACK_TO_EMAIL = 'support@example.test';
};

describe('send-feedback API logging', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sendMock.mockReset();
    delete process.env.RESEND_API_KEY;
    delete process.env.FEEDBACK_FROM_EMAIL;
    delete process.env.FEEDBACK_TO_EMAIL;
    delete process.env.FEEDBACK_ALLOWED_ORIGINS;
    delete process.env.VITE_APP_URL;
  });

  it('logs a redacted summary when feedback email is not configured', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const req = makeReq(feedbackBody);
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Feedback email is not configured' });

    const logged = flattenLoggedValues(consoleError);
    expect(logged).toContain('Feedback email configuration missing:');
    expect(logged).toContain('"feedbackLength":48');
    expect(logged).toContain('"hasEmail":true');
    expect(logged).toContain('"hasUnverifiedAccountEmail":true');
    expect(logged).toContain('"hasUnverifiedUserId":true');
    expect(logged).not.toContain(feedbackBody.feedback);
    expect(logged).not.toContain(feedbackBody.email);
    expect(logged).not.toContain(feedbackBody.accountEmail);
    expect(logged).not.toContain(feedbackBody.userId);
  });

  it('allows the configured app URL for feedback requests', async () => {
    process.env.VITE_APP_URL = 'https://app.example.test/some/path';
    const req = makeReq(feedbackBody, 'https://app.example.test');
    const res = makeRes();

    await handler(req, res);

    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://app.example.test');
  });

  it('allows extra configured feedback origins', async () => {
    process.env.FEEDBACK_ALLOWED_ORIGINS =
      'https://first.example.test, https://second.example.test/path';
    const req = makeReq(feedbackBody, 'https://second.example.test');
    const res = makeRes();

    await handler(req, res);

    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://second.example.test');
  });

  it('does not send feedback CORS allow headers to disallowed browser origins', async () => {
    const req = {
      method: 'OPTIONS',
      headers: {
        origin: 'https://attacker.example',
      },
      body: undefined,
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(res.headers['Access-Control-Allow-Methods']).toBeUndefined();
    expect(res.headers['Access-Control-Allow-Headers']).toBeUndefined();
    expect(res.headers['Access-Control-Max-Age']).toBeUndefined();
    expect(res.headers.Vary).toBeUndefined();
  });

  it('does not send feedback CORS metadata for no-origin preflight requests', async () => {
    const req = {
      method: 'OPTIONS',
      headers: {},
      body: undefined,
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(res.headers['Access-Control-Allow-Methods']).toBeUndefined();
    expect(res.headers['Access-Control-Allow-Headers']).toBeUndefined();
    expect(res.headers['Access-Control-Max-Age']).toBeUndefined();
    expect(res.headers.Vary).toBeUndefined();
  });

  it('sends feedback CORS allow headers to allowed browser origins', async () => {
    const req = {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:5173',
      },
      body: undefined,
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    expect(res.headers['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
    expect(res.headers['Access-Control-Allow-Headers']).toBe('Content-Type');
    expect(res.headers['Access-Control-Max-Age']).toBe('300');
    expect(res.headers.Vary).toBe('Origin');
  });

  it('requires explicit feedback sender and recipient configuration', async () => {
    process.env.RESEND_API_KEY = 'test_resend_key';
    const req = makeReq(feedbackBody);
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('uses configured feedback sender and recipients', async () => {
    process.env.RESEND_API_KEY = 'test_resend_key';
    process.env.FEEDBACK_FROM_EMAIL = 'app-feedback@example.test';
    process.env.FEEDBACK_TO_EMAIL = 'support@example.test, ops@example.test, ';
    sendMock.mockResolvedValueOnce({ error: null });
    const req = makeReq(feedbackBody);
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'app-feedback@example.test',
        to: ['support@example.test', 'ops@example.test'],
      })
    );
  });

  it('trims valid fields before sending feedback emails', async () => {
    configureFeedbackEnv();
    sendMock.mockResolvedValueOnce({ error: null });
    const req = makeReq({
      feedback: '  This trimmed message is long enough.  ',
      email: '  reply@example.test  ',
      accountEmail: '  account@example.test  ',
      userId: '  user_123  ',
      type: ' bug ',
    });
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'New bug Feedback - Organized Glitter',
        html: expect.stringContaining(
          '<div style="white-space: pre-wrap; margin-top: 12px; font-style: italic;">This trimmed message is long enough.</div>'
        ),
      })
    );
    const html = sendMock.mock.calls[0][0].html;
    expect(html).toContain('<strong>Reply Email:</strong> reply@example.test');
    expect(html).toContain(
      '<strong>Unverified Account Email (client supplied):</strong> account@example.test'
    );
    expect(html).toContain('<strong>Unverified User ID (client supplied):</strong> user_123');
  });

  it('keeps reply email and unverified account email separate in feedback emails', async () => {
    configureFeedbackEnv();
    sendMock.mockResolvedValueOnce({ error: null });
    const req = makeReq({
      ...feedbackBody,
      email: 'reply@example.test',
      accountEmail: 'account@example.test',
    });
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('<strong>Reply Email:</strong> reply@example.test'),
      })
    );
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining(
          '<strong>Unverified Account Email (client supplied):</strong> account@example.test'
        ),
      })
    );
    expect(sendMock.mock.calls[0][0].html).not.toContain('<strong>Account Email:</strong>');
  });

  it('shows when the reply email was left blank', async () => {
    configureFeedbackEnv();
    sendMock.mockResolvedValueOnce({ error: null });
    const req = makeReq({
      ...feedbackBody,
      email: undefined,
      accountEmail: 'account@example.test',
    });
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('<strong>Reply Email:</strong> Not provided'),
      })
    );
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining(
          '<strong>Unverified Account Email (client supplied):</strong> account@example.test'
        ),
      })
    );
  });

  it('normalizes blank optional fields as omitted', async () => {
    configureFeedbackEnv();
    sendMock.mockResolvedValueOnce({ error: null });
    const req = makeReq({
      feedback: 'This blank optional field message is long enough.',
      email: '   ',
      accountEmail: '',
      userId: '\t',
      type: '   ',
    });
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const email = sendMock.mock.calls[0][0];
    expect(email.subject).toBe('New general Feedback - Organized Glitter');
    expect(email.html).toContain('<strong>Reply Email:</strong> Not provided');
    expect(email.html).not.toContain('Unverified Account Email');
    expect(email.html).not.toContain('Unverified User ID');
  });

  it('labels body-supplied identity metadata as unverified', async () => {
    configureFeedbackEnv();
    sendMock.mockResolvedValueOnce({ error: null });
    const req = makeReq({
      ...feedbackBody,
      accountEmail: 'account@example.test',
      userId: 'user_123',
    });
    const res = makeRes();

    await handler(req, res);

    const html = sendMock.mock.calls[0][0].html;
    expect(html).toContain(
      '<strong>Unverified Account Email (client supplied):</strong> account@example.test'
    );
    expect(html).toContain('<strong>Unverified User ID (client supplied):</strong> user_123');
    expect(html).not.toContain('<strong>Account Email:</strong>');
    expect(html).not.toContain('<strong>User ID:</strong>');
  });

  it('returns 400 when feedback is missing', async () => {
    configureFeedbackEnv();
    const req = makeReq({
      email: 'sarah@example.test',
      type: 'bug',
    });
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Feedback is required' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the body is not a JSON object', async () => {
    configureFeedbackEnv();
    const req = makeReq(null);
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Request body must be a JSON object' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('returns 400 when feedback is not a string', async () => {
    configureFeedbackEnv();
    const req = makeReq({
      ...feedbackBody,
      feedback: 123,
    });
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Feedback must be a string' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('returns 400 when feedback is too short', async () => {
    configureFeedbackEnv();
    const req = makeReq({
      ...feedbackBody,
      feedback: 'too short',
    });
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Feedback must be at least 10 characters long' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('returns 400 when feedback is too long', async () => {
    configureFeedbackEnv();
    const req = makeReq({
      ...feedbackBody,
      feedback: 'a'.repeat(5001),
    });
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Feedback must be 5000 characters or fewer' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('returns 400 when type is invalid', async () => {
    configureFeedbackEnv();
    const req = makeReq({
      ...feedbackBody,
      type: 'urgent',
    });
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: 'type must be one of general, bug, feature, improvement, other',
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid reply email', { email: 'not-an-email' }, 'email must be a valid email address'],
    [
      'oversized reply email',
      { email: `${'a'.repeat(309)}@example.test` },
      'email must be 320 characters or fewer',
    ],
    [
      'invalid account email',
      { accountEmail: 'not-an-email' },
      'accountEmail must be a valid email address',
    ],
    [
      'oversized account email',
      { accountEmail: `${'a'.repeat(309)}@example.test` },
      'accountEmail must be 320 characters or fewer',
    ],
    ['non-string user id', { userId: 123 }, 'userId must be a string'],
    ['oversized user id', { userId: 'u'.repeat(129) }, 'userId must be 128 characters or fewer'],
    ['null reply email', { email: null }, 'email must be a string'],
    ['null account email', { accountEmail: null }, 'accountEmail must be a string'],
    ['null user id', { userId: null }, 'userId must be a string'],
    ['null type', { type: null }, 'type must be a string'],
  ])('returns 400 for %s', async (_name, override, error) => {
    configureFeedbackEnv();
    const req = makeReq({
      ...feedbackBody,
      ...override,
    });
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('returns 400 when unknown fields are present', async () => {
    configureFeedbackEnv();
    const req = makeReq({
      ...feedbackBody,
      role: 'admin',
    });
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Request body contains unsupported fields' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('does not log raw Resend API errors', async () => {
    configureFeedbackEnv();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendMock.mockResolvedValueOnce({
      error: {
        name: 'validation_error',
        message: 'API rejected key test_resend_key for sarah@example.test',
        statusCode: 422,
        secret: 'should-not-log',
      },
    });

    const req = makeReq(feedbackBody);
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to send feedback' });

    const logged = flattenLoggedValues(consoleError);
    expect(logged).toContain('Resend error:');
    expect(logged).toContain('"name":"validation_error"');
    expect(logged).toContain('"statusCode":422');
    expect(logged).not.toContain('test_resend_key');
    expect(logged).not.toContain('sarah@example.test');
    expect(logged).not.toContain(feedbackBody.accountEmail);
    expect(logged).not.toContain(feedbackBody.userId);
    expect(logged).not.toContain('should-not-log');
    expect(logged).not.toContain(feedbackBody.feedback);
  });

  it('does not log raw Resend execution errors', async () => {
    configureFeedbackEnv();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error('Network failed for sarah@example.test with test_resend_key'), {
        statusCode: 503,
        secret: 'execution-secret',
      })
    );

    const req = makeReq(feedbackBody);
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Unable to send feedback. Please try again later.' });

    const logged = flattenLoggedValues(consoleError);
    expect(logged).toContain('Resend import/execution error:');
    expect(logged).toContain('"statusCode":503');
    expect(logged).not.toContain('test_resend_key');
    expect(logged).not.toContain('sarah@example.test');
    expect(logged).not.toContain(feedbackBody.accountEmail);
    expect(logged).not.toContain(feedbackBody.userId);
    expect(logged).not.toContain('execution-secret');
    expect(logged).not.toContain(feedbackBody.feedback);
  });
});
