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
});
