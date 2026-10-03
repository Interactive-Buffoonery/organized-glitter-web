import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  applyIndexInventory,
  assertUpgradeChangeContract,
  classifyUpgradeChanges,
  collectUpgradeChanges,
  parseChangedPaths,
  resolveBaseRef,
  resolveUpgradeRunDir,
  schemasHaveSameContract,
} from '../validate-pocketbase-upgrade.mjs';

describe('PocketBase prior-schema upgrade gate', () => {
  it('accepts only newly added forward migrations', () => {
    const changes = parseChangedPaths(
      'A\tpb_migrations/1800000000_forward.js\nM\tdocs/pocketbase/collections.schema.json\n'
    );

    expect(classifyUpgradeChanges(changes)).toEqual({
      addedMigrations: ['pb_migrations/1800000000_forward.js'],
      schemaTouched: true,
    });
  });

  it.each(['M', 'D', 'R100'])('%s rejects edits to a deployable migration', status => {
    const change =
      status === 'R100'
        ? [{ status, previousPath: 'pb_migrations/old.js', path: 'pb_migrations/new.js' }]
        : [{ status, previousPath: null, path: 'pb_migrations/old.js' }];

    expect(() => classifyUpgradeChanges(change)).toThrow(/must remain immutable/i);
  });

  it('ignores export timestamps and formatting when comparing schema contracts', () => {
    const left = JSON.stringify([
      { id: 'projects', name: 'projects', type: 'base', created: 'old', updated: 'old' },
    ]);
    const right = JSON.stringify(
      [{ updated: 'new', type: 'base', name: 'projects', id: 'projects', created: 'new' }],
      null,
      2
    );

    expect(schemasHaveSameContract(left, right)).toBe(true);
  });

  it('rejects a schema contract change without a forward migration', () => {
    expect(() =>
      assertUpgradeChangeContract({ addedMigrations: [], schemaContractChanged: true })
    ).toThrow(/without a new deployable migration/i);
  });

  it('includes tracked worktree changes and ignored untracked migrations', () => {
    const gitFn = vi.fn(args => {
      if (args[0] === 'diff') {
        expect(args).not.toContain('HEAD');
        return 'M\tdocs/pocketbase/collections.schema.json\n';
      }
      return 'pb_migrations/1800000000_forward.js\n';
    });

    expect(collectUpgradeChanges({ baseCommit: 'base-sha', gitFn })).toEqual([
      {
        path: 'docs/pocketbase/collections.schema.json',
        previousPath: null,
        status: 'M',
      },
      {
        path: 'pb_migrations/1800000000_forward.js',
        previousPath: null,
        status: 'A',
      },
    ]);
  });

  it('fails explicitly for an all-zero first-push baseline', () => {
    expect(() => resolveBaseRef([], { GITHUB_EVENT_BEFORE: '0'.repeat(40) })).toThrow(
      /needs a real base commit/i
    );
  });

  it('uses the resolved CI comparison base ahead of raw event fields', () => {
    expect(
      resolveBaseRef([], {
        CI_BASE_SHA: 'resolved-base',
        GITHUB_BASE_SHA: 'pull-request-base',
        GITHUB_EVENT_BEFORE: 'push-before',
      })
    ).toBe('resolved-base');
  });

  it('strips legacy index terminators when applying the production inventory', () => {
    const schema = applyIndexInventory(
      [
        {
          id: 'books',
          name: 'coloring_books',
          indexes: ['CREATE INDEX leftover ON coloring_books (status);'],
        },
        {
          id: 'notes',
          name: 'progress_notes',
          indexes: ['CREATE INDEX idx_progress_notes_project ON progress_notes (project);'],
        },
      ],
      {
        coloring_books: [
          'CREATE INDEX `idx_coloring_books_completion_percentage` ON `coloring_books` (`completion_percentage`);\n',
        ],
      }
    );

    expect(schema).toEqual([
      {
        id: 'books',
        name: 'coloring_books',
        indexes: [
          'CREATE INDEX `idx_coloring_books_completion_percentage` ON `coloring_books` (`completion_percentage`)',
        ],
      },
      {
        id: 'notes',
        name: 'progress_notes',
        indexes: ['CREATE INDEX idx_progress_notes_project ON progress_notes (project)'],
      },
    ]);
  });

  it.each(['', '.', '..', '/tmp/outside'])('rejects unsafe upgrade run id %j', runId => {
    const directory = mkdtempSync(path.join(tmpdir(), 'og-upgrade-root-'));
    try {
      expect(() => resolveUpgradeRunDir(runId, directory)).toThrow(/must stay inside/i);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

it('recognizes only an empty root commit as a bootstrap baseline', async () => {
  const { isBootstrapBaseline } = await import('../validate-pocketbase-upgrade.mjs');
  expect(isBootstrapBaseline('root', () => '')).toBe(true);
  expect(
    isBootstrapBaseline('existing', args => (args[0] === 'ls-tree' ? 'README.md\n' : ''))
  ).toBe(false);
  expect(
    isBootstrapBaseline('deleted-tree', args => (args[0] === 'ls-tree' ? '' : 'parent-sha'))
  ).toBe(false);
});
