import { describe, expect, it } from 'vitest';

import { getLocalE2ESkipReason, isLocalUrl } from '../e2e/fixtures/local-safety';

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
});
