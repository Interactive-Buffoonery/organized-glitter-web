import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { id: 'account-a' } as { id: string } | null,
  get: vi.fn(),
  update: vi.fn(),
  subscribe: vi.fn(),
  authCallback: undefined as undefined | (() => void),
}));
vi.mock('@/services/auth', () => ({
  getCurrentUser: () => mocks.user,
  onAuthChange: (callback: () => void) => {
    mocks.authCallback = callback;
    callback();
    return vi.fn();
  },
}));
vi.mock('@/services/pocketbase/users.service', () => ({
  UsersService: {
    getAnalyticsOptOut: mocks.get,
    updateAnalyticsOptOut: mocks.update,
    subscribeAnalyticsPreference: mocks.subscribe,
  },
}));

let stop: (() => void) | undefined;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  mocks.user = { id: 'account-a' };
  mocks.get.mockResolvedValue(false);
  mocks.update.mockResolvedValue(true);
  mocks.subscribe.mockResolvedValue(async () => {});
});
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
});
async function initialize() {
  const service = await import('@/services/analytics-preference');
  stop = service.initializeAnalyticsPreference();
  await Promise.resolve();
  await Promise.resolve();
  return service;
}
function signOut() {
  mocks.user = null;
  mocks.authCallback?.();
}

describe('analytics preference privacy and recovery', () => {
  it('preserves an opt-out when sign-out precedes the save response', async () => {
    let resolveSave!: (optOut: boolean) => void;
    mocks.update.mockImplementation(
      () =>
        new Promise<boolean>(resolve => {
          resolveSave = resolve;
        })
    );
    const service = await initialize();
    const save = service.setAnalyticsEnabled(false);
    signOut();
    resolveSave(true);
    await save;
    expect(service.getAnalyticsPreference().enabled).toBe(false);
    expect(JSON.parse(localStorage.getItem('og:analytics:account-consent')!)).toEqual({
      accountId: 'account-a',
      enabled: false,
    });
  });

  it.each(['missing', 'unreadable'])(
    'remembers opt-out with %s storage after sign-out',
    async mode => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      const service = await initialize();
      await service.setAnalyticsEnabled(false);
      if (mode === 'unreadable')
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
          throw new Error('blocked');
        });
      signOut();
      expect(service.getAnalyticsPreference().enabled).toBe(false);
    }
  );

  it('remembers a pending opt-out in memory when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    mocks.update.mockImplementation(() => new Promise(() => {}));
    const service = await initialize();
    void service.setAnalyticsEnabled(false);
    signOut();
    expect(service.getAnalyticsPreference().enabled).toBe(false);
  });

  it.each(['unreadable', 'corrupt'])(
    'allows signed-out capture with %s consent and no memory',
    async mode => {
      mocks.user = null;
      if (mode === 'corrupt') localStorage.setItem('og:analytics:account-consent', '{');
      else
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
          throw new Error('blocked');
        });
      const service = await initialize();
      expect(service.getAnalyticsPreference().enabled).toBe(true);
    }
  );

  it.each(['failed read', 'no subscription'])(
    'retries every thirty seconds with %s',
    async mode => {
      vi.useFakeTimers();
      if (mode === 'failed read') mocks.get.mockRejectedValue(new Error('offline'));
      else mocks.subscribe.mockRejectedValue(new Error('offline'));
      await initialize();
      expect(mocks.get).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(mocks.get).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(mocks.get).toHaveBeenCalledTimes(3);
    }
  );

  it('refreshes healthy subscriptions only every five minutes', async () => {
    vi.useFakeTimers();
    await initialize();
    await vi.advanceTimersByTimeAsync(270_000);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it('refreshes on visible resume and focus, skips hidden ticks, and cleans up', async () => {
    vi.useFakeTimers();
    mocks.subscribe.mockRejectedValue(new Error('offline'));
    await initialize();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(mocks.get).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();
    expect(mocks.get).toHaveBeenCalledTimes(3);
    stop?.();
    stop = undefined;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(300_000);
    expect(mocks.get).toHaveBeenCalledTimes(3);
  });

  it('shares the consent storage contract with the real bootstrap reader', async () => {
    const service = await initialize();
    const source = readFileSync(resolve(process.cwd(), 'public/js/bootstrap-analytics.js'), 'utf8');
    expect(service.ACCOUNT_CONSENT_STORAGE_KEY).toBe('og:analytics:account-consent');
    expect(source).toContain(service.ACCOUNT_CONSENT_STORAGE_KEY);
    new Script(source).runInThisContext();
    localStorage.setItem('pocketbase_auth', JSON.stringify({ record: { id: 'account-a' } }));
    const sendBeacon = vi.fn(() => true);
    const capture = () =>
      window.__OG_BOOTSTRAP_ANALYTICS__!.captureBootstrapFailureShown('startup_timeout', {
        storage: localStorage,
        config: { key: 'phc_test', host: '/glimmer' },
        sendBeacon,
      });
    expect(capture()).toBe(true);
    await service.setAnalyticsEnabled(false);
    expect(capture()).toBe(false);
    signOut();
    localStorage.removeItem('pocketbase_auth');
    expect(capture()).toBe(false);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    delete window.__OG_BOOTSTRAP_ANALYTICS__;
  });
});
