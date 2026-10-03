import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

class BadRequestError extends Error {}

class ApiError extends Error {
  constructor(status, message, data = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function loadHelpers() {
  const module = { exports: {} };
  vm.runInNewContext(
    readFileSync(resolve(process.cwd(), 'pb_hooks/tag_revision_helpers.js'), 'utf8'),
    { module, ApiError, BadRequestError }
  );
  return module.exports;
}

function record(fields) {
  return {
    getString: field => String(fields[field] ?? ''),
    original: () => record(fields.original ?? {}),
  };
}

function event({
  guarded = false,
  action = 'create',
  parentOwner = 'owner',
  tagOwner = 'owner',
} = {}) {
  const parent = {
    getString: field => (field === 'user' ? parentOwner : ''),
    revision: 0,
  };
  const tag = { getString: field => (field === 'user' ? tagOwner : '') };
  const findRecordById = vi.fn((collection, id) => {
    if (collection === 'projects' && id === 'project-1') return parent;
    if (collection === 'tags' && id === 'tag-1') return tag;
    throw new Error(`Unexpected lookup: ${collection}/${id}`);
  });
  const save = vi.fn(saved => {
    saved.revision += 1;
  });
  const app = {
    findRecordById,
    save,
    runInTransaction: vi.fn(callback => callback(app)),
  };
  const next = vi.fn();
  const e = {
    app,
    context: { value: () => guarded },
    record: record({ project: 'project-1', tag: 'tag-1' }),
    next,
  };
  return { e, app, next, findRecordById, save, parent, action };
}

const relation = { parent: 'projects', parentField: 'project', tags: 'tags' };

describe('tag revision helper', () => {
  it.each([
    ['another user', record({ id: 'owner-2' })],
    ['no authenticated user', null],
  ])('rejects a guarded update owned by %s before writing', (_label, auth) => {
    const current = {
      id: 'project-1',
      getInt: field => (field === 'revision' ? 3 : 0),
      getString: field => (field === 'user' ? 'owner-1' : ''),
    };
    const app = {
      findRecordById: vi.fn(() => current),
      runInTransaction: vi.fn(callback => callback(app)),
    };
    const next = vi.fn();
    const e = {
      app,
      auth,
      context: {},
      next,
      record: { id: current.id },
      requestInfo: () => ({
        body: {},
        headers: { x_og_expected_revision: '3' },
      }),
    };

    expect(() =>
      loadHelpers().guardedUpdate(e, {
        collection: 'projects',
        conflictMessage: 'This project changed elsewhere.',
      })
    ).toThrow(
      expect.objectContaining({
        status: 403,
        message: 'This project changed elsewhere.',
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('passes a prevalidated guarded join through without duplicate lookups or parent saves', () => {
    const { e, app, next, findRecordById, save } = event({ guarded: true });

    loadHelpers().reviseTagParent(e, relation, 'create');

    expect(next).toHaveBeenCalledOnce();
    expect(findRecordById).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(app.runInTransaction).not.toHaveBeenCalled();
  });

  it('rejects an unguarded join with a different tag owner before writing', () => {
    const { e, next, save } = event({ tagOwner: 'other-owner' });

    expect(() => loadHelpers().reviseTagParent(e, relation, 'create')).toThrow(BadRequestError);
    expect(next).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('saves the parent after a valid unguarded join to advance its revision', () => {
    const { e, next, save, parent } = event();

    loadHelpers().reviseTagParent(e, relation, 'create');

    expect(next).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledExactlyOnceWith(parent);
    expect(parent.revision).toBe(1);
  });
});
