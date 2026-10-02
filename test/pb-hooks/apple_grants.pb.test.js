import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

function record(fields) {
  return {
    id: String(fields.id ?? ''),
    getBool: field => Boolean(fields[field]),
    getString: field => String(fields[field] ?? ''),
  };
}

function loadHook(queueForIdentity) {
  const deleteHandlers = [];
  const revocation = { processPending: vi.fn(), queueForIdentity, queueForUser: vi.fn() };
  const app = {
    findRecordById: vi.fn(() => record({ id: 'owner-1', verified: true })),
  };
  app.runInTransaction = vi.fn(callback => callback(app));

  vm.runInNewContext(readFileSync(resolve(process.cwd(), 'pb_hooks/apple_grants.pb.js'), 'utf8'), {
    __hooks: '/hooks',
    $app: { logger: () => ({ warn: vi.fn() }) },
    $security: { sha256: value => `hash:${value}` },
    cronAdd: vi.fn(),
    onRecordAuthWithOAuth2Request: vi.fn(),
    onRecordDelete: handler => deleteHandlers.push(handler),
    onRecordDeleteRequest: vi.fn(),
    require: path => {
      if (path === '/hooks/apple_revocation.js') return revocation;
      return { capture: vi.fn() };
    },
  });

  return { app, deleteHandlers };
}

describe('Apple grant deletion hooks', () => {
  it('queues only the deleted link owner and Apple identity', () => {
    const queueForIdentity = vi.fn();
    const { app, deleteHandlers } = loadHook(queueForIdentity);
    const next = vi.fn();
    const event = {
      app,
      next,
      record: record({
        provider: 'apple',
        providerId: 'shared-subject',
        recordRef: 'owner-1',
      }),
    };

    deleteHandlers[1](event);

    expect(queueForIdentity).toHaveBeenCalledExactlyOnceWith(app, 'hash:shared-subject', 'owner-1');
    expect(next).toHaveBeenCalledOnce();
  });
});
