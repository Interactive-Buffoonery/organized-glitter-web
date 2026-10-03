import { describe, expect, it } from 'vitest';

import {
  getLocalE2ETargetDisposition,
  getLocalE2ESkipReason,
  getRequiredFixtureAction,
  isLocalUrl,
} from '../e2e/fixtures/local-safety';

describe('local E2E safety helpers', () => {
  it('treats loopback hosts as local and rejects hosted URLs', () => {
    expect(isLocalUrl('http://localhost:3000')).toBe(true);
    expect(isLocalUrl('http://127.0.0.1:8090')).toBe(true);
    expect(isLocalUrl('http://[::1]:8090')).toBe(true);
    expect(isLocalUrl('https://organized-glitter-preview.up.railway.app')).toBe(false);
    expect(isLocalUrl('https://data.organizedglitter.app')).toBe(false);
    expect(isLocalUrl(undefined)).toBe(false);
    expect(isLocalUrl('not-a-url')).toBe(false);
  });

  it('returns a skip reason for hosted targets instead of allowing mutation', () => {
    expect(
      getLocalE2ESkipReason({
        appUrl: 'http://localhost:3000',
        pocketBaseUrl: 'http://localhost:8090',
        specName: 'Example local suite',
      })
    ).toBeNull();

    const hostedReason = getLocalE2ESkipReason({
      appUrl: 'https://organized-glitter-preview.up.railway.app',
      pocketBaseUrl: 'https://data.organizedglitter.app',
      specName: 'Example local suite',
    });

    expect(hostedReason).toContain('Example local suite mutates data');
    expect(hostedReason).toContain('organized-glitter-preview.up.railway.app');
    expect(hostedReason).toContain('data.organizedglitter.app');
  });

  it('skips when either the app or PocketBase URL is non-local', () => {
    expect(
      getLocalE2ESkipReason({
        appUrl: 'https://organized-glitter-preview.up.railway.app',
        pocketBaseUrl: 'http://localhost:8090',
        specName: 'Partial hosted',
      })
    ).not.toBeNull();

    expect(
      getLocalE2ESkipReason({
        appUrl: 'http://localhost:3000',
        pocketBaseUrl: 'https://data.organizedglitter.app',
        specName: 'Partial hosted',
      })
    ).not.toBeNull();
  });

  it.each(['smoke', 'full'])('fails missing local targets for managed %s runs', suite => {
    expect(
      getLocalE2ETargetDisposition({
        appUrl: undefined,
        pocketBaseUrl: undefined,
        specName: 'Required fixture suite',
        suite,
      })
    ).toMatchObject({ action: 'fail' });
  });

  it('preserves skips for hosted deployment runs', () => {
    expect(
      getLocalE2ETargetDisposition({
        appUrl: 'https://organized-glitter-preview.up.railway.app',
        pocketBaseUrl: 'https://data.organizedglitter.app',
        specName: 'Hosted fixture suite',
        suite: undefined,
      })
    ).toMatchObject({ action: 'skip' });
  });

  it.each(['smoke', 'full'])('requires fixtures for managed %s runs', suite => {
    expect(getRequiredFixtureAction({ ci: false, suite })).toBe('fail');
  });

  it('allows hosted fixture skips outside managed runs', () => {
    expect(getRequiredFixtureAction({ ci: false, suite: undefined })).toBe('skip');
  });
});
