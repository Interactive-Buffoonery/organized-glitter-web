import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('managed safe-area coverage', () => {
  it.each(['smoke', 'full'])('runs %s safe-area coverage as public iPhone WebKit', async suite => {
    vi.stubEnv('E2E_QA_SUITE', suite);
    vi.stubEnv('E2E_STORAGE_STATE', '/tmp/authenticated-state.json');
    const { default: config } = await import('../../playwright.ci.config');
    const projects = config.projects!.filter(project => {
      const patterns = [project.testMatch].flat();
      return patterns.some(
        pattern => pattern instanceof RegExp && pattern.test('/e2e/pwa-safe-area.spec.ts')
      );
    });

    expect(projects).toHaveLength(1);
    expect(projects[0].use).toMatchObject({ defaultBrowserType: 'webkit', isMobile: true });
    expect(projects[0].use?.storageState).toBeUndefined();
    expect(projects[0].dependencies ?? []).toEqual([]);
  });
});
