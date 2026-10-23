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
