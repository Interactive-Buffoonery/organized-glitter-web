import { describe, expect, it } from 'vitest';
import { validateCreateSpinParams } from '../randomizer.schema';

describe('randomizer schema validation', () => {
  it('allows one target in the spin pool', () => {
    expect(() =>
      validateCreateSpinParams({
        user: 'user12345678901',
        project: 'project12345678',
        project_title: 'Aurora Wolves',
        selected_projects: ['project12345678'],
      })
    ).not.toThrow();
  });

  it('rejects an empty spin pool', () => {
    expect(() =>
      validateCreateSpinParams({
        user: 'user12345678901',
        project_title: 'Aurora Wolves',
        selected_projects: [],
      })
    ).toThrow('At least 1 target must be in the randomizer pool');
  });
});
