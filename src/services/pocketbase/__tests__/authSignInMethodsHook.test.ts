import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

class MockApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly data?: unknown
  ) {
    super(message);
  }
}

class MockForbiddenError extends MockApiError {
  constructor(message = 'Forbidden') {
    super(403, message);
  }
}

class MockBadRequestError extends MockApiError {
  constructor(message = 'Bad request') {
    super(400, message);
  }
}

class MockNotFoundError extends MockApiError {
  constructor(message = 'Not found') {
    super(404, message);
  }
}

class MockTooManyRequestsError extends MockApiError {
  constructor(message = 'Too many requests') {
    super(429, message);
  }
}

class MockDateTime {
  readonly value: Date;

  constructor(value?: string) {
    this.value = value ? new Date(value) : new Date();
  }

  after(other: MockDateTime) {
    return this.value > other.value;
  }

  before(other: MockDateTime) {
    return this.value < other.value;
  }

  string() {
    return this.value.toISOString();
  }
}

class MockRecord {
  id = '';
  readonly values: Record<string, unknown> = {};

  constructor(readonly collection: { name: string }) {}

  set(field: string, value: unknown) {
    this.values[field] = value;
  }

  getString(field: string) {
    return String(this.values[field] || '');
  }

  getInt(field: string) {
    return Number(this.values[field] || 0);
  }

  getDateTime(field: string) {
    return this.values[field] as MockDateTime;
  }
}

type ExternalAuth = {
  provider: () => string;
  providerId: () => string;
};

type AuthRecord = MockRecord & {
  getBool: (field: string) => boolean;
  validatePassword: (password: string) => boolean;
};

type HookState = {
  attempts: MockRecord[];
  configuredProviders?: string[];
  externalAuths: ExternalAuth[];
  passwordAuthEnabled?: boolean;
  proofs: MockRecord[];
};

const VALID_PROOF = 'A'.repeat(43);

const externalAuth = (provider: string, providerId = `${provider}-id`): ExternalAuth => ({
  provider: () => provider,
  providerId: () => providerId,
});

const authRecord = (id: string, options: { verified?: boolean; password?: string } = {}) => {
  const record = new MockRecord({ name: 'users' }) as AuthRecord;
  record.id = id;
  record.getBool = field => field === 'verified' && (options.verified ?? true);
  record.validatePassword = password => password === options.password;
  return record;
};

const proofRecord = ({
  action = 'link',
  expires = '2999-01-01T00:00:00.000Z',
  method = 'password',
  provider = 'google',
  user = 'user00000000001',
  value = VALID_PROOF,
}: {
  action?: 'link' | 'unlink';
  expires?: string;
  method?: 'password' | 'oauth';
  provider?: string;
  user?: string;
  value?: string;
} = {}) => {
  const proof = new MockRecord({ name: 'auth_step_up_proofs' });
  proof.set('action', action);
  proof.set('expires', new MockDateTime(expires));
  proof.set('proof_hash', `hash:${value}`);
  proof.set('target_provider', provider);
  proof.set('user', user);
  proof.set('verification_method', method);
  return proof;
};

const createApp = (state: HookState, user: AuthRecord) => {
  const txApp = {
    isTransactional: vi.fn(() => true),
    delete: vi.fn((record: MockRecord | ExternalAuth) => {
      for (const records of [state.proofs, state.attempts, state.externalAuths]) {
        const index = records.indexOf(record as never);
        if (index !== -1) records.splice(index, 1);
      }
    }),
    findAllExternalAuthsByRecord: vi.fn(() => [...state.externalAuths]),
    findCollectionByNameOrId: vi.fn((name: string) => {
      if (name === 'users') {
        return {
          name,
          oauth2: {
            enabled: true,
            providers: (state.configuredProviders || ['apple', 'google', 'discord']).map(name => ({
              name,
            })),
          },
          passwordAuth: { enabled: state.passwordAuthEnabled ?? true },
        };
      }
      return { name };
    }),
    findRecordById: vi.fn(() => user),
    findRecordsByFilter: vi.fn(
      (
        collection: string,
        filter: string,
        _sort: string,
        _limit: number,
        _offset: number,
        params: Record<string, string>
      ) => {
        if (collection === 'auth_step_up_attempts') {
          return state.attempts.filter(record => record.getString('user') === params.user);
        }
        if (collection !== 'auth_step_up_proofs') return [];
        if (filter.startsWith('expires')) {
          const now = new MockDateTime(params.now);
          return state.proofs.filter(record => !record.getDateTime('expires').after(now));
        }
        if (filter.includes('proof_hash')) {
          const action = filter.includes('action = "link"') ? 'link' : 'unlink';
          return state.proofs.filter(
            record =>
              record.getString('proof_hash') === params.proof &&
              record.getString('user') === params.user &&
              record.getString('action') === action &&
              record.getString('target_provider') === params.provider
          );
        }
        return state.proofs.filter(
          record =>
            record.getString('user') === params.user &&
            record.getString('action') === params.action &&
            record.getString('target_provider') === params.provider
        );
      }
    ),
    save: vi.fn((record: MockRecord) => {
      const target =
        record.collection.name === 'auth_step_up_attempts' ? state.attempts : state.proofs;
      if (!target.includes(record)) target.push(record);
    }),
  };

  return {
    ...txApp,
    isTransactional: vi.fn(() => false),
    runInTransaction: vi.fn((callback: (app: typeof txApp) => void) => callback(txApp)),
  };
};

const loadHook = () => {
  let oauthHandler: (event: Record<string, unknown>) => void = () => undefined;
  let directDeleteHandler: (event: Record<string, unknown>) => void = () => undefined;
  let passwordHandler: (event: Record<string, unknown>) => void = () => undefined;
  let unlinkHandler: (event: Record<string, unknown>) => void = () => undefined;

  runInNewContext(
    readFileSync(join(process.cwd(), 'pb_hooks/auth_sign_in_methods.pb.js'), 'utf8'),
    {
      ApiError: MockApiError,
      BadRequestError: MockBadRequestError,
      Date,
      DateTime: MockDateTime,
      DynamicModel: class DynamicModel {
        constructor(values: Record<string, unknown>) {
          Object.assign(this, values);
        }
      },
      ForbiddenError: MockForbiddenError,
      NotFoundError: MockNotFoundError,
      Record: MockRecord,
      String,
      TooManyRequestsError: MockTooManyRequestsError,
      $apis: { bodyLimit: vi.fn(() => Symbol('body-limit')), requireAuth: vi.fn(() => Symbol()) },
      $security: { sha256: (value: string) => `hash:${value}` },
      onRecordAuthWithOAuth2Request: (handler: typeof oauthHandler) => {
        oauthHandler = handler;
      },
      onRecordDeleteRequest: (handler: typeof directDeleteHandler) => {
        directDeleteHandler = handler;
      },
      routerAdd: (method: string, path: string, handler: typeof unlinkHandler) => {
        if (method === 'POST' && path === '/api/auth/step-up/password') passwordHandler = handler;
        if (method === 'DELETE') unlinkHandler = handler;
      },
    }
  );

  return { directDeleteHandler, oauthHandler, passwordHandler, unlinkHandler };
};

const oauthEvent = (
  state: HookState,
  overrides: Record<string, unknown> = {},
  user = authRecord('user00000000001')
) => ({
  app: createApp(state, user),
  auth: undefined,
  isNewRecord: false,
  next: vi.fn(),
  oAuth2User: { id: 'google-id' },
  providerName: 'google',
  record: user,
  ...overrides,
});

const passwordEvent = (
  state: HookState,
  body: Record<string, unknown>,
  user = authRecord('user00000000001', { password: 'known-password' })
) => ({
  app: createApp(state, user),
  auth: user,
  bindBody: vi.fn((model: Record<string, unknown>) => Object.assign(model, body)),
  noContent: vi.fn(),
});

const unlinkEvent = (
  state: HookState,
  provider: string,
  proof: string,
  user = authRecord('user00000000001')
) => ({
  app: createApp(state, user),
  auth: user,
  bindBody: vi.fn((body: Record<string, unknown>) => {
    body.proof = proof;
  }),
  noContent: vi.fn(),
  request: { pathValue: () => provider },
});

const emptyState = (): HookState => ({ attempts: [], externalAuths: [], proofs: [] });

describe('PocketBase sign-in methods hook', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['apple', 'google', 'discord'])(
    'allows %s sign-in without optional create data',
    provider => {
      const { oauthHandler } = loadHook();
      const state = emptyState();
      state.externalAuths.push(externalAuth(provider));
      const event = oauthEvent(state, {
        providerName: provider,
        oAuth2User: { id: `${provider}-id` },
      });

      oauthHandler(event);

      expect(event.next).toHaveBeenCalledOnce();
    }
  );

  it.each([undefined, null])('allows signup with absent create data (%s)', createData => {
    const { oauthHandler } = loadHook();
    const event = oauthEvent(emptyState(), { record: undefined, createData });

    oauthHandler(event);

    expect(event.next).toHaveBeenCalledOnce();
  });

  it('rejects linking without create data instead of crashing', () => {
    const { oauthHandler } = loadHook();
    const user = authRecord('user00000000001');
    const event = oauthEvent(emptyState(), { auth: user }, user);

    expect(() => oauthHandler(event)).toThrow(/verify your identity again/i);
    expect(event.next).not.toHaveBeenCalled();
  });

  it('rejects a stolen authenticated session that has no fresh proof', () => {
    const { oauthHandler } = loadHook();
    const state = emptyState();
    const user = authRecord('user00000000001');
    const event = oauthEvent(state, { auth: user, createData: {} }, user);

    expect(() => oauthHandler(event)).toThrow(/verify your identity again/i);
    expect(event.next).not.toHaveBeenCalled();
  });

  it('consumes one action, user, and provider-bound proof before linking', () => {
    const { oauthHandler } = loadHook();
    const state = emptyState();
    state.proofs.push(proofRecord());
    const user = authRecord('user00000000001');
    const event = oauthEvent(
      state,
      { auth: user, createData: { og_step_up_proof: VALID_PROOF } },
      user
    );

    oauthHandler(event);

    expect(event.next).toHaveBeenCalledOnce();
    expect(state.proofs).toHaveLength(0);
    expect(() => oauthHandler(event)).toThrow(/verify your identity again/i);
  });

  it('consumes a link proof in the surrounding OAuth transaction', () => {
    const { oauthHandler } = loadHook();
    const state = emptyState();
    state.proofs.push(proofRecord());
    const user = authRecord('user00000000001');
    const app = createApp(state, user);
    app.isTransactional.mockReturnValue(true);
    const event = oauthEvent(
      state,
      { app, auth: user, createData: { og_step_up_proof: VALID_PROOF } },
      user
    );

    oauthHandler(event);

    expect(event.next).toHaveBeenCalledOnce();
    expect(state.proofs).toHaveLength(0);
    expect(app.runInTransaction).not.toHaveBeenCalled();
  });

  it.each([
    { action: 'unlink' as const, provider: 'google', user: 'user00000000001' },
    { action: 'link' as const, provider: 'apple', user: 'user00000000001' },
    { action: 'link' as const, provider: 'google', user: 'other00000000001' },
  ])('rejects a proof with the wrong scope: $action $provider $user', scope => {
    const { oauthHandler } = loadHook();
    const state = emptyState();
    state.proofs.push(proofRecord(scope));
    const user = authRecord('user00000000001');
    const event = oauthEvent(
      state,
      { auth: user, createData: { og_step_up_proof: VALID_PROOF } },
      user
    );

    expect(() => oauthHandler(event)).toThrow(/verify your identity again/i);
    expect(state.proofs).toHaveLength(1);
  });

  it('deletes and rejects an expired proof', () => {
    const { oauthHandler } = loadHook();
    const state = emptyState();
    state.proofs.push(proofRecord({ expires: '2000-01-01T00:00:00.000Z' }));
    const user = authRecord('user00000000001');

    expect(() =>
      oauthHandler(
        oauthEvent(state, { auth: user, createData: { og_step_up_proof: VALID_PROOF } }, user)
      )
    ).toThrow(/verify your identity again/i);
    expect(state.proofs).toHaveLength(0);
  });

  it('serializes concurrent link attempts by consuming the proof once', () => {
    const { oauthHandler } = loadHook();
    const state = emptyState();
    state.proofs.push(proofRecord());
    const user = authRecord('user00000000001');
    const first = oauthEvent(
      state,
      { auth: user, createData: { og_step_up_proof: VALID_PROOF } },
      user
    );
    const second = oauthEvent(
      state,
      { auth: user, createData: { og_step_up_proof: VALID_PROOF } },
      user
    );

    oauthHandler(first);
    expect(() => oauthHandler(second)).toThrow(/verify your identity again/i);
    expect(first.next).toHaveBeenCalledOnce();
    expect(second.next).not.toHaveBeenCalled();
  });

  it('mints OAuth-only proof after exact existing provider identity reauthentication', () => {
    const { oauthHandler } = loadHook();
    const state = emptyState();
    state.externalAuths.push(externalAuth('google'));
    const event = oauthEvent(state, {
      createData: {
        og_step_up_action: 'link',
        og_step_up_proof: 'A'.repeat(43),
        og_step_up_target_provider: 'apple',
        og_step_up_user_id: 'user00000000001',
      },
    });

    oauthHandler(event);

    expect(event.next).toHaveBeenCalledOnce();
    expect(state.proofs[0]?.getString('verification_method')).toBe('oauth');
    expect(state.proofs[0]?.getString('verification_provider')).toBe('google');
    expect(state.proofs[0]?.getString('target_provider')).toBe('apple');
  });

  it('does not mint OAuth proof from an email match with a different provider identity', () => {
    const { oauthHandler } = loadHook();
    const state = emptyState();
    state.externalAuths.push(externalAuth('google', 'different-id'));
    const event = oauthEvent(state, {
      createData: {
        og_step_up_action: 'link',
        og_step_up_proof: 'A'.repeat(43),
        og_step_up_target_provider: 'apple',
        og_step_up_user_id: 'user00000000001',
      },
    });

    expect(() => oauthHandler(event)).toThrow(/cannot verify the current account/i);
    expect(state.proofs).toHaveLength(0);
  });

  it('does not mint proof when OAuth reauthentication returns another account', () => {
    const { oauthHandler } = loadHook();
    const state = emptyState();
    state.externalAuths.push(externalAuth('google'));
    const remoteUser = authRecord('other00000000001');
    const event = oauthEvent(
      state,
      {
        createData: {
          og_step_up_action: 'link',
          og_step_up_proof: 'A'.repeat(43),
          og_step_up_target_provider: 'apple',
          og_step_up_user_id: 'user00000000001',
        },
      },
      remoteUser
    );

    expect(() => oauthHandler(event)).toThrow(/cannot verify the current account/i);
    expect(state.proofs).toHaveLength(0);
  });

  it('mints password proof and enforces a persistent per-user failure ceiling', () => {
    const { passwordHandler } = loadHook();
    const state = emptyState();
    const accepted = passwordEvent(state, {
      action: 'unlink',
      password: 'known-password',
      proof: 'B'.repeat(43),
      targetProvider: 'google',
    });
    passwordHandler(accepted);
    expect(state.proofs[0]?.getString('verification_method')).toBe('password');

    state.proofs.splice(0);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(() =>
        passwordHandler(
          passwordEvent(state, {
            action: 'link',
            password: 'wrong-password',
            proof: 'C'.repeat(43),
            targetProvider: 'apple',
          })
        )
      ).toThrow(/incorrect/i);
    }
    expect(() =>
      passwordHandler(
        passwordEvent(state, {
          action: 'link',
          password: 'wrong-password',
          proof: 'D'.repeat(43),
          targetProvider: 'apple',
        })
      )
    ).toThrow(/too many/i);
  });

  it('consumes proof and unlinks atomically when account continuity remains', () => {
    const { unlinkHandler } = loadHook();
    const state = emptyState();
    state.externalAuths.push(externalAuth('google'), externalAuth('discord'));
    state.proofs.push(proofRecord({ action: 'unlink', method: 'oauth' }));

    unlinkHandler(unlinkEvent(state, 'google', VALID_PROOF));

    expect(state.proofs).toHaveLength(0);
    expect(state.externalAuths.map(identity => identity.provider())).toEqual(['discord']);
  });

  it('consumes OAuth proof but preserves the last configured identity after drift', () => {
    const { unlinkHandler } = loadHook();
    const state = emptyState();
    state.externalAuths.push(externalAuth('google'));
    state.proofs.push(proofRecord({ action: 'unlink', method: 'oauth' }));

    expect(() => unlinkHandler(unlinkEvent(state, 'google', VALID_PROOF))).toThrow(
      /sign-in methods changed/i
    );
    expect(state.proofs).toHaveLength(0);
    expect(state.externalAuths).toHaveLength(1);
  });

  it('ignores another linked provider if an admin disabled it before unlink', () => {
    const { unlinkHandler } = loadHook();
    const state = emptyState();
    state.configuredProviders = ['google'];
    state.externalAuths.push(externalAuth('google'), externalAuth('discord'));
    state.proofs.push(proofRecord({ action: 'unlink', method: 'oauth' }));

    expect(() => unlinkHandler(unlinkEvent(state, 'google', VALID_PROOF))).toThrow(
      /sign-in methods changed/i
    );
    expect(state.externalAuths.map(identity => identity.provider())).toEqual(['google', 'discord']);
  });

  it('preserves the last provider if an admin disables password auth after proof', () => {
    const { unlinkHandler } = loadHook();
    const state = emptyState();
    state.configuredProviders = ['google'];
    state.passwordAuthEnabled = false;
    state.externalAuths.push(externalAuth('google'));
    state.proofs.push(proofRecord({ action: 'unlink', method: 'password' }));

    expect(() => unlinkHandler(unlinkEvent(state, 'google', VALID_PROOF))).toThrow(
      /sign-in methods changed/i
    );
    expect(state.proofs).toHaveLength(0);
    expect(state.externalAuths.map(identity => identity.provider())).toEqual(['google']);
  });

  it('blocks owner deletion through the direct external auth API', () => {
    const { directDeleteHandler } = loadHook();
    const event = { hasSuperuserAuth: () => false, next: vi.fn() };

    expect(() => directDeleteHandler(event)).toThrow(/guarded sign-in method route/i);
    expect(event.next).not.toHaveBeenCalled();
  });
});
