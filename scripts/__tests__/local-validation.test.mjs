import { describe, expect, it } from 'vitest';

import { buildPhasePlan, parseArgs, formatValidationReport } from '../run-local-validation.mjs';

describe('local validation orchestrator', () => {
  it('cloud checks retain every non-browser PR phase and delegate every browser phase', () => {
    const pr = buildPhasePlan('pr');
    const cloud = buildPhasePlan('cloud');
    expect(cloud).toEqual(pr.slice(0, 6));
    const report = formatValidationReport({
      profile: 'cloud',
      outcome: 'cloud-checks-passed',
      platform: { operatingSystem: 'linux', architecture: 'x64' },
      repository: { base: { sha: 'abc' }, head: { commit: 'def' } },
      phases: pr.map(([name], index) => ({
        name,
        outcome: index < 6 ? 'passed' : 'delegated-to-ci',
      })),
    });
    for (const [name] of pr.slice(6)) expect(report).toContain(`| ${name} | delegated-to-ci |`);
    expect(report).toContain('Browser coverage: delegated to CI, not passed locally.');
    expect(report).toContain('Complete PR validation: not established by this cloud profile.');
    expect(parseArgs(['--profile=cloud', '--base=origin/dev']).profile).toBe('cloud');
  });
});
