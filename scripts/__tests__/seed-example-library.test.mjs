import { describe, expect, it, vi } from 'vitest';

import { seedExampleLibrary } from '../seed-example-library.mjs';

describe.each(['projects', 'coloring_books'])('example %s ownership', collection => {
  it.each(['', undefined, null, 'another-user'])(
    'refuses an existing fixture owned by %s',
    async owner => {
      const update = vi.fn();
      const create = vi.fn();
      const client = {
        baseURL: 'http://127.0.0.1:8090',
        collection: name =>
          name === collection
            ? { getOne: async () => ({ user: owner }), update, create }
            : { getOne: async id => ({ id, user: 'local-user' }), update: async id => ({ id }) },
      };
      await expect(seedExampleLibrary(client, 'local-user')).rejects.toThrow(/another local user/);
      expect(update).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    }
  );
});
