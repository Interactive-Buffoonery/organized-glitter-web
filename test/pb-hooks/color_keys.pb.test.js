import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function helpers(env = {}) {
  const module = { exports: {} };
  vm.runInNewContext(readFileSync('pb_hooks/color_keys.js', 'utf8'), {
    module,
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
  get: name => data[name],
  set: (name, value) => {
    data[name] = value;
  },
});

describe('color key validation failure modes', () => {
  it('rejects non-array JSON, non-string entries and excessive lengths', () => {
    const h = helpers();
    for (const tried of [null, {}, 'code', [1], Array(21).fill('x'), ['x'.repeat(101)]]) {
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
    expect(h.prepareKeyCreate({ position: 0 })).toEqual([]);
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
    helpers({ recipient: 'maintainer@example.test' }).notify(app, request, false);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0].text).toContain('requester@example.test');
    expect(JSON.stringify(error.mock.calls)).not.toContain('private');
  });
  it('rejects invalid resolved IDs and does not resolve declined requests', () => {
    const h = helpers();
    for (const symbol of ['', 'r:abc123def456ghi', 'u:abcd', 'c:UPPER']) {
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

it('keeps the real color key suite in the existing backend validation phase', () => {
  const { scripts } = JSON.parse(readFileSync('package.json', 'utf8'));
  expect(scripts['pb:test:color-keys']).toBe('node scripts/test-color-keys-pocketbase.mjs');
  expect(scripts['test:ci:backend']).toContain('pnpm pb:test:color-keys');
  expect(scripts['test:ci:backend']).toContain('pnpm pb:test:feedback');
});
