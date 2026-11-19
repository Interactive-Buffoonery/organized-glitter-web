import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

class BadRequestError extends Error {}

function loadHelpers() {
  const module = { exports: {} };
  vm.runInNewContext(
    readFileSync(resolve(process.cwd(), 'pb_hooks/crafting_activity.js'), 'utf8'),
    {
      BadRequestError,
      module,
      $security: { randomStringWithAlphabet: () => 'abcdefghijklmno' },
    }
  );
  return module.exports;
}

function appWith(execute) {
  const warn = vi.fn();
  const bind = vi.fn(() => ({ execute }));
  return {
    app: {
      db: () => ({ newQuery: () => ({ bind }) }),
      logger: () => ({ warn }),
    },
    bind,
    warn,
  };
}

describe('crafting activity helpers', () => {
  it('floors a time to the start of its UTC 15-minute slot', () => {
    const { slotFor } = loadHelpers();
    expect(slotFor(Date.UTC(2026, 10, 14, 9, 44, 59, 999))).toBe('2026-11-14 09:30:00.000Z');
    expect(slotFor(Date.UTC(2026, 10, 14, 9, 45))).toBe('2026-11-14 09:45:00.000Z');
    expect(slotFor(Date.UTC(2026, 10, 14, 23, 59))).toBe('2026-11-14 23:45:00.000Z');
  });

  it('records one slot for a signed-in user', () => {
    const { record } = loadHelpers();
    const { app, bind } = appWith(vi.fn());
    record(app, { id: 'user00000000001', isSuperuser: () => false }, Date.UTC(2026, 10, 14, 9, 7));
    expect(bind).toHaveBeenCalledWith(
      expect.objectContaining({ user: 'user00000000001', slot: '2026-11-14 09:00:00.000Z' })
    );
  });

  it('skips missing and superuser auth', () => {
    const { record } = loadHelpers();
    const { app, bind } = appWith(vi.fn());
    record(app, null);
    record(app, { id: 'admin', isSuperuser: () => true });
    expect(bind).not.toHaveBeenCalled();
  });

  it('logs a warning instead of throwing when the write fails', () => {
    const { record } = loadHelpers();
    const { app, warn } = appWith(() => {
      throw new Error('no such table');
    });
    expect(() => record(app, { id: 'user00000000001', isSuperuser: () => false })).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('records after a successful route only', () => {
    const { afterRoute } = loadHelpers();
    const { app, bind } = appWith(vi.fn());
    const auth = { id: 'user00000000001', isSuperuser: () => false };
    afterRoute({ app, auth, next: vi.fn(), status: () => 200 });
    afterRoute({ app, auth, next: vi.fn(), status: () => 400 });
    expect(bind).toHaveBeenCalledOnce();
  });

  it('accepts real days inside the window and rejects the rest', () => {
    const { validateMarkDay } = loadHelpers();
    const now = Date.UTC(2026, 10, 14, 12);
    expect(() => validateMarkDay('2026-11-14', now)).not.toThrow();
    expect(() => validateMarkDay('2026-11-06', now)).not.toThrow();
    expect(() => validateMarkDay('2026-11-15', now)).not.toThrow();
    expect(() => validateMarkDay('2026-11-05', now)).toThrow(BadRequestError);
    expect(() => validateMarkDay('2026-11-16', now)).toThrow(BadRequestError);
    expect(() => validateMarkDay('2026-02-30', now)).toThrow(BadRequestError);
    expect(() => validateMarkDay('2026-11-14T00:00', now)).toThrow(BadRequestError);
  });
});
