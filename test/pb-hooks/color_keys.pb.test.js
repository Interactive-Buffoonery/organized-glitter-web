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

it('logs the original propagation failure before reporting the key ID', () => {
  const failure = new Error('controlled storage failure');
  const error = vi.fn();
  const app = {
    runInTransaction: run => run(app),
    findRecordById: () => record({ status: 'open' }),
    findRecordsByFilter: () => [record({ id: 'failedkey000001' })],
    save: () => {
      throw failure;
    },
    logger: () => ({ error }),
  };
  const e = { app, record: record({ status: 'added', resolved_symbol: 'u:0041' }), next: vi.fn() };
  expect(() => helpers().resolveRequest(e)).toThrow('failedkey000001');
  expect(error).toHaveBeenCalledWith(
    expect.any(String),
    'key_id',
    'failedkey000001',
    'error',
    failure
  );
  expect(e.next).not.toHaveBeenCalled();
});
