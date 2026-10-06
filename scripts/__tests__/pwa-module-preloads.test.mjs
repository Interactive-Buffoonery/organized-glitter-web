import { describe, expect, it } from 'vitest';
import { pwaModulePreloads } from '../pwa-module-preloads.mjs';

describe('PWA module preload policy', () => {
  const dependencies = [
    'assets/react-vendor-abc.js',
    'assets/virtual_pwa-register-abc.js',
    'assets/route.css',
  ];
  it('does not issue duplicate vendor preloads when deferred PWA registration begins', () => {
    expect(
      pwaModulePreloads('assets/virtual_pwa-register-abc.js', dependencies, { hostType: 'js' })
    ).toEqual(['assets/route.css']);
  });
  it('preserves normal route preloads and HTML handling', () => {
    expect(pwaModulePreloads('assets/Projects-abc.js', dependencies, { hostType: 'js' })).toEqual(
      dependencies
    );
    expect(
      pwaModulePreloads('assets/virtual_pwa-register-abc.js', dependencies, { hostType: 'html' })
    ).toEqual(dependencies);
  });
});
