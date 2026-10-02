import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

class ApiError extends Error {
  constructor(status, message, data = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

class ValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function record(fields) {
  return {
    id: String(fields.id ?? ''),
    getString: field => String(fields[field] ?? ''),
    set: (field, value) => {
      fields[field] = value;
    },
  };
}

function loadModule(path, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(readFileSync(resolve(process.cwd(), path), 'utf8'), {
    ApiError,
    BadRequestError: Error,
    Record: class {},
    ValidationError,
    module,
    ...globals,
  });
  return module.exports;
}

describe('Apple grant store', () => {
  it('scopes link revocation to the Apple identity and user', () => {
    const ownerGrant = record({
      id: 'grant-owner',
      provider_id_hash: 'shared-identity',
      state: 'active',
      user_id: 'owner-1',
    });
    const otherGrant = record({
      id: 'grant-other',
      provider_id_hash: 'shared-identity',
      state: 'active',
      user_id: 'owner-2',
    });
    const grants = [ownerGrant, otherGrant];
    const app = {
      findRecordsByFilter: vi.fn((_collection, filter, _sort, _limit, _offset, params) =>
        grants.filter(grant => {
          if (grant.getString('provider_id_hash') !== params.identity) return false;
          return !params.user || grant.getString('user_id') === params.user;
        })
      ),
      save: vi.fn(),
    };

    loadModule('pb_hooks/apple_revocation.js').queueForIdentity(app, 'shared-identity', 'owner-1');

    expect(ownerGrant.getString('state')).toBe('revocation_pending');
    expect(otherGrant.getString('state')).toBe('active');
    expect(app.findRecordsByFilter).toHaveBeenCalledWith(
      'apple_oauth_grants',
      'provider_id_hash = {:identity} && user_id = {:user}',
      '',
      0,
      0,
      { identity: 'shared-identity', user: 'owner-1' }
    );
  });

  it('sets a retry delay when the linked-grant scan exceeds capacity', () => {
    const grants = Array.from({ length: 501 }, (_, index) =>
      record({
        id: `grant-${String(index).padStart(4, '0')}`,
        provider_id_hash: 'shared-identity',
        state: 'active',
        user_id: 'owner-1',
      })
    );
    const app = {
      findCollectionByNameOrId: vi.fn(() => ({ id: 'users-collection' })),
      findRecordsByFilter: vi.fn((collection, filter, _sort, limit, _offset, params) => {
        if (collection === '_externalAuths') {
          return [record({ providerId: 'apple-subject', recordRef: 'owner-1' })];
        }
        if (filter.includes('state = "revocation_pending"')) return [];
        if (filter.includes('id > {:cursor}')) {
          const start = params.cursor
            ? grants.findIndex(grant => grant.id === params.cursor) + 1
            : 0;
          return grants.slice(start, start + limit);
        }
        return [];
      }),
    };
    const setHeader = vi.fn();
    const response = { header: () => ({ set: setHeader }) };
    const store = loadModule('pb_hooks/apple_grant_store.js', {
      $security: { sha256: () => 'shared-identity' },
    });

    expect(() =>
      store.requireActive(app, 'shared-identity', 'native-client', false, 'apple', false, response)
    ).toThrow(
      expect.objectContaining({
        status: 503,
        data: { reason: expect.objectContaining({ code: 'apple_grant_check_limit' }) },
      })
    );
    expect(setHeader).toHaveBeenCalledExactlyOnceWith('Retry-After', '30');
  });
});
