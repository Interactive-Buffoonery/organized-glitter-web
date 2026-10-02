import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const source = readFileSync(join(process.cwd(), 'pb_hooks/feedback.pb.js'), 'utf8');

function makeRoute() {
  let handler;
  const context = {
    routerAdd: (_method, _path, callback) => {
      handler = callback;
    },
    $apis: { requireAuth: vi.fn(), bodyLimit: vi.fn() },
    MailerMessage: class {
      constructor(value) {
        Object.assign(this, value);
      }
    },
    Date,
    $os: {
      getenv: key => (key === 'FEEDBACK_TO_EMAIL' ? 'feedback@example.test' : ''),
    },
  };
  runInNewContext(source, context);
  return handler;
}

function makeStore() {
  const entries = new Map();
  return {
    setFunc: (key, callback) => entries.set(key, callback(entries.get(key))),
  };
}

function makeEvent(body, options = {}) {
  const store = options.store ?? makeStore();
  const send = vi.fn(options.send ?? (() => {}));
  const logError = vi.fn();
  const event = {
    requestInfo: () => ({ body }),
    auth: {
      getString: field =>
        ({ id: options.userId ?? 'user-one', email: 'account@example.test' })[field],
      getBool: field => field === 'verified',
    },
    app: {
      store: () => store,
      settings: () => ({
        meta: { senderAddress: 'sender@example.test', senderName: 'Organized Glitter' },
      }),
      newMailClient: () => ({ send }),
      logger: () => ({ error: logError }),
    },
    json: vi.fn((status, value) => ({ status, value })),
  };
  return { event, send, logError };
}

describe('PocketBase feedback route', () => {
  let route;
  beforeEach(() => {
    route = makeRoute();
  });

  it('uses authenticated identity and escapes feedback in the sent email', () => {
    const { event, send } = makeEvent({
      feedback: 'Please fix <this> & that.',
      email: 'reply@example.test',
      type: 'bug',
    });
    expect(route(event)).toMatchObject({ status: 200, value: { success: true } });
    expect(send).toHaveBeenCalledOnce();
    const mail = send.mock.calls[0][0];
    expect(mail.from.address).toBe('sender@example.test');
    expect(mail.to).toEqual([{ address: 'feedback@example.test' }]);
    expect(mail.html).toContain('account@example.test');
    expect(mail.html).toContain('reply@example.test');
    expect(mail.html).toContain('Please fix &lt;this&gt; &amp; that.');
  });

  it('rejects spoofed identity and oversized feedback before mail', () => {
    for (const body of [
      { feedback: 'This is a valid message', userId: 'someone-else' },
      { feedback: 'a'.repeat(5001) },
    ]) {
      const { event, send } = makeEvent(body);
      expect(route(event).status).toBe(400);
      expect(send).not.toHaveBeenCalled();
    }
  });

  it('limits the same account to five attempts in fifteen minutes', () => {
    const { event, send } = makeEvent({ feedback: 'This is a valid message' });
    for (let i = 0; i < 5; i++) expect(route(event).status).toBe(200);
    const limited = route(event);
    expect(limited.status).toBe(429);
    expect(limited.value).toMatchObject({ reason: 'rate_limited' });
    expect(send).toHaveBeenCalledTimes(5);
  });

  it('tracks separate accounts and clears expired windows atomically', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-25T00:00:00Z'));
      route = makeRoute();
      const store = makeStore();
      const first = makeEvent({ feedback: 'This is a valid message' }, { store, userId: 'first' });
      const second = makeEvent(
        { feedback: 'This is a valid message' },
        { store, userId: 'second' }
      );
      for (let i = 0; i < 5; i++) expect(route(first.event).status).toBe(200);
      expect(route(first.event).status).toBe(429);
      expect(route(second.event).status).toBe(200);
      vi.advanceTimersByTime(15 * 60 * 1000);
      expect(route(first.event).status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });

  it('caps active account windows without counting unrelated app store entries', () => {
    const store = makeStore();
    const active = {};
    for (let i = 0; i < 10000; i++) {
      active[`user:${i}`] = { count: 1, expiresAt: Date.now() + 900000 };
    }
    store.setFunc('organized_glitter_feedback_limits', () => JSON.stringify(active));
    store.setFunc('another_app_key', () => 'unrelated');
    const { event, send } = makeEvent(
      { feedback: 'This is a valid message' },
      { store, userId: 'new-account' }
    );
    expect(route(event).status).toBe(503);
    expect(send).not.toHaveBeenCalled();
  });

  it('does not report success when mail delivery fails', () => {
    const { event, logError } = makeEvent(
      { feedback: 'This is a valid message' },
      {
        send: () => {
          throw new Error('SMTP failed');
        },
      }
    );
    expect(route(event)).toMatchObject({ status: 503, value: { error: expect.any(String) } });
    expect(logError).toHaveBeenCalledOnce();
    expect(logError.mock.calls[0].slice(1, 3)).toEqual(['reason', 'feedback_delivery_failed']);
  });
});
