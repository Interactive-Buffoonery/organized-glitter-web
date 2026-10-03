import { describe, expect, it, vi } from 'vitest';

import { collectFixtureProjects } from '../seed-e2e-randomizer-fixture.mjs';

describe('collectFixtureProjects', () => {
  it('returns every fixture when all creates succeed', async () => {
    const logError = vi.fn();
    const findOrCreate = vi.fn(async index => ({ id: `proj-${index}` }));

    const projects = await collectFixtureProjects(3, findOrCreate, logError);

    expect(projects).toEqual([{ id: 'proj-1' }, { id: 'proj-2' }, { id: 'proj-3' }]);
    expect(findOrCreate).toHaveBeenCalledTimes(3);
    expect(logError).not.toHaveBeenCalled();
  });

  it('rejects partial success after attempting every fixture', async () => {
    const logError = vi.fn();
    const findOrCreate = vi.fn(async index => {
      if (index === 2) {
        throw new Error('create failed');
      }
      return { id: `proj-${index}` };
    });

    await expect(collectFixtureProjects(3, findOrCreate, logError)).rejects.toThrow(
      'Fixture seeding incomplete: 2 succeeded, 1 failed; expected all 3 fixtures.'
    );
    expect(findOrCreate).toHaveBeenCalledTimes(3);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith({
      reason: 'fixture_seed_failed',
      index: 2,
      error: expect.any(Error),
    });
  });

  it('throws when every fixture create fails', async () => {
    const logError = vi.fn();
    const findOrCreate = vi.fn(async index => {
      throw new Error(`create failed ${index}`);
    });

    await expect(collectFixtureProjects(3, findOrCreate, logError)).rejects.toThrow(
      'Fixture seeding incomplete: 0 succeeded, 3 failed; expected all 3 fixtures.'
    );
    expect(findOrCreate).toHaveBeenCalledTimes(3);
    expect(logError).toHaveBeenCalledTimes(3);
    expect(logError).toHaveBeenNthCalledWith(1, {
      reason: 'fixture_seed_failed',
      index: 1,
      error: expect.any(Error),
    });
  });
});
