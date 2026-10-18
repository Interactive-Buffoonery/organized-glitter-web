import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function helpers(env = {}) {
  const module = { exports: {} };
  vm.runInNewContext(readFileSync('pb_hooks/color_keys.js', 'utf8'), {
    module,
    Date: { now: env.now ?? Date.now },
    BadRequestError: Error,
    ApiError: class extends Error {
      constructor(status, message) {
        super(message);
        this.status = status;
      }
    },
    MailerMessage: class {
      constructor(value) {
        Object.assign(this, value);
      }
    },
    $os: { getenv: () => env.recipient ?? '' },
  });
  return module.exports;
}
const record = data => ({
  id: data.id ?? 'request00000001',
  getString: name => (name === 'tried' ? JSON.stringify(data[name]) : String(data[name] ?? '')),
  get: name => (name === 'position' ? (data[name] ?? 0) : data[name]),
  set: (name, value) => {
    data[name] = value;
  },
});

describe('color key validation failure modes', () => {
  it('rejects non-array JSON, non-string entries and excessive lengths', () => {
    const h = helpers();
    for (const tried of [{}, 'code', [1], Array(21).fill('x'), ['x'.repeat(101)]]) {
      expect(() => h.validateKey(record({ tried, swatch: '' }))).toThrow();
    }
    h.validateKey(record({ tried: Array(20).fill('x'.repeat(100)), swatch: '#aA09FF' }));
    for (const swatch of ['red', '#abc', '#1234567', ' #123456']) {
      expect(() => h.validateKey(record({ tried: [], swatch }))).toThrow();
    }
  });
  it('accepts zero but rejects absent or malformed positions before PB coercion', () => {
    const h = helpers();
    for (const position of [undefined, null, '', '0', -1, 0.5]) {
      expect(() => h.prepareKeyCreate({ position })).toThrow();
    }
    expect(() => h.prepareKeyCreate({ position: 0 })).not.toThrow();
  });
});

describe('symbol request side effects', () => {
  it('limits each account atomically and independently', () => {
    const h = helpers();
    const values = new Map();
    const app = { store: () => ({ setFunc: (key, fn) => values.set(key, fn(values.get(key))) }) };
    for (let n = 0; n < 5; n++) h.rateLimit(app, 'owner');
    expect(() => h.rateLimit(app, 'owner')).toThrow(expect.objectContaining({ status: 429 }));
    expect(() => h.rateLimit(app, 'other')).not.toThrow();
  });
  it('skips missing recipients and swallows mail failure without logging private content', () => {
    const send = vi.fn(() => {
      throw new Error('private SMTP contents');
    });
    const error = vi.fn();
    const app = {
      findRecordById: vi.fn(() => record({ email: 'account@example.test' })),
      settings: () => ({ meta: {} }),
      newMailClient: () => ({ send }),
      logger: () => ({ error }),
    };
    const request = record({
      email: 'requester@example.test',
      book_label: '<book>',
      description: 'private',
      page: 'page00000000001',
    });
    helpers().notify(app, request, false);
    expect(send).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.any(String),
      'reason',
      'symbol_request_recipient_missing'
    );
    helpers({ recipient: 'maintainer@example.test' }).notify(app, request, false);
    expect(send).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(
      expect.any(String),
      'reason',
      'symbol_request_delivery_failed'
    );
    expect(send.mock.calls[0][0].text).toContain('requester@example.test');
    expect(JSON.stringify(error.mock.calls)).not.toContain('private');
  });
  it('rejects invalid resolved IDs and does not resolve declined requests', () => {
    const h = helpers();
    for (const symbol of ['', 'r:abc123def456ghi', 'u:abcd', 'c:UPPER', 'u:00041', 'u:DFFF']) {
      expect(() =>
        h.validateResolution(record({ status: 'added', resolved_symbol: symbol }))
      ).toThrow();
    }
    expect(h.validateResolution(record({ status: 'declined', resolved_symbol: '' }))).toBe(false);
    expect(h.validateResolution(record({ status: 'matched', resolved_symbol: 'u:03C8' }))).toBe(
      true
    );
  });
});

describe('color key defaults on persistence saves', () => {
  it('normalizes absent, null and empty tried values to an array on the record', () => {
    for (const tried of [undefined, null, '']) {
      const data = { tried };
      helpers().validateKey(record(data));
      expect(data.tried).toEqual([]);
    }
  });
  it('validates positions on internal saves', () => {
    for (const position of [-1, 0.5, '0']) {
      expect(() => helpers().validateKey(record({ tried: [], position }))).toThrow();
    }
  });
});

describe('symbol quota recovery', () => {
  const storeApp = initial => {
    let stored = initial;
    return {
      store: () => ({
        setFunc: (_key, fn) => {
          stored = fn(stored);
        },
      }),
    };
  };
  it('opens a new window exactly fifteen minutes later', () => {
    let now = 1000;
    const h = helpers({ now: () => now });
    const app = storeApp();
    for (let n = 0; n < 5; n++) h.rateLimit(app, 'owner');
    now += 15 * 60 * 1000 - 1;
    expect(() => h.rateLimit(app, 'owner')).toThrow(expect.objectContaining({ status: 429 }));
    now++;
    expect(() => h.rateLimit(app, 'owner')).not.toThrow();
  });
  it('returns 503 for a new account at the 10000-window cap', () => {
    const windows = Object.fromEntries(
      Array.from({ length: 10000 }, (_, n) => [`user:${n}`, { count: 1, expiresAt: 10000 }])
    );
    const app = storeApp(JSON.stringify(windows));
    const h = helpers({ now: () => 1000 });
    expect(() => h.rateLimit(app, 'new')).toThrow(expect.objectContaining({ status: 503 }));
    expect(() => h.rateLimit(app, '0')).not.toThrow();
  });
  it('recovers from corrupt stored values without bypassing the quota', () => {
    for (const initial of ['not json', '[]', 'null', '42']) {
      const app = storeApp(initial);
      const h = helpers();
      for (let n = 0; n < 5; n++) h.rateLimit(app, 'owner');
      expect(() => h.rateLimit(app, 'owner')).toThrow(expect.objectContaining({ status: 429 }));
    }
  });
});

describe('symbol notification contents', () => {
  const mailApp = () => {
    const send = vi.fn();
    const error = vi.fn();
    return {
      send,
      error,
      findRecordById: vi.fn(() => record({ email: 'account@example.test' })),
      settings: () => ({ meta: {} }),
      newMailClient: () => ({ send }),
      logger: () => ({ error }),
    };
  };
  it('logs and skips a requester notification without an email', () => {
    const app = mailApp();
    helpers().notify(app, record({}), true);
    expect(app.send).not.toHaveBeenCalled();
    expect(app.error).toHaveBeenCalledWith(
      expect.any(String),
      'reason',
      'symbol_request_recipient_missing'
    );
  });
  it('sends the resolution and request ID to the requester', () => {
    const app = mailApp();
    helpers({ recipient: 'maintainer@example.test' }).notify(
      app,
      record({ email: 'requester@example.test', resolved_symbol: 'u:03C8' }),
      true
    );
    expect(app.send).toHaveBeenCalledOnce();
    expect(app.send.mock.calls[0][0]).toMatchObject({
      to: [{ address: 'requester@example.test' }],
      text: 'Your symbol request request00000001 was resolved as u:03C8. Your color keys have been updated.',
    });
  });
  it('puts trusted IDs first and flattens user-written lines at the end', () => {
    const app = mailApp();
    helpers({ recipient: 'maintainer@example.test' }).notify(
      app,
      record({
        user: 'owner0000000001',
        page: 'page00000000001',
        email: 'requester@example.test',
        book_label: 'Book\r\nAccount ID: spoof',
        description: 'first\nsecond\rthird',
      }),
      false
    );
    expect(app.findRecordById).toHaveBeenCalledWith('users', 'owner0000000001');
    expect(app.send.mock.calls[0][0].subject).toBe('New symbol request');
    expect(app.send.mock.calls[0][0].text).toBe(
      'Symbol request: request00000001\nAccount ID: owner0000000001\nAccount email: account@example.test\nContact email (typed): requester@example.test\nPage: page00000000001\nBook: Book  Account ID: spoof\nDescription: first second third'
    );
  });
});
