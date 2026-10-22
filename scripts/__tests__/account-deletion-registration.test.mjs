import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildPhasePlan } from '../run-local-validation.mjs';

describe('account deletion backend gate registration', () => {
  it('retains the contract suite and fails closed before accepting worker results', () => {
    const { scripts } = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(scripts['pb:test:account-deletion']).toBe(
      'node scripts/test-account-deletion.mjs && node scripts/test-account-deletion-worker.mjs'
    );
    expect(scripts['test:ci:backend'].split(' && ')).toEqual([
      'pnpm pb:test:examples',
      'pnpm pb:validate:schema',
      'pnpm pb:validate:migrations',
      'pnpm pb:validate:upgrade',
      'pnpm pb:test:index-evidence',
      'pnpm pb:test:protected-file-upgrade',
      'pnpm pb:test:auth-verification',
      'pnpm pb:test:feedback',
      'pnpm pb:test:native-oauth-association',
      'pnpm pb:test:auth-step-up',
      'pnpm pb:test:native-apple',
      'pnpm pb:test:archive-restore-v3',
      'pnpm pb:test:mobile-sync',
      'pnpm pb:test:stats',
      'pnpm pb:test:account-deletion',
    ]);
    for (const profile of ['backend', 'pr', 'cloud']) {
      expect(buildPhasePlan(profile)[0]).toEqual(['backend', 'test:ci:backend']);
    }
  });
});
