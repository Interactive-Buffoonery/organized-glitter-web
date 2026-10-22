import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

  it('detects an uncommitted new migration in a real worktree', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'og-upgrade-git-'));
    const gitFn = args => {
      const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr);
      return result.stdout;
    };
    try {
      gitFn(['init', '-q']);
      mkdirSync(path.join(directory, 'pb_migrations'));
      writeFileSync(path.join(directory, 'pb_migrations', '1700000000_base.js'), '// base\n');
      gitFn(['add', '.']);
      gitFn(['-c', 'user.name=t', '-c', 'user.email=t@example.test', 'commit', '-qm', 'base']);
      writeFileSync(path.join(directory, 'pb_migrations', '1800000000_new.js'), '// new\n');

      expect(collectUpgradeChanges({ baseCommit: 'HEAD', gitFn })).toEqual([
        { path: 'pb_migrations/1800000000_new.js', previousPath: null, status: 'A' },
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('includes tracked worktree changes and untracked migrations', () => {
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

  const deployedThroughMigration = '1791260989_add_users_analytics_opt_out.js';
  const unreleasedIndex =
    'CREATE INDEX idx_account_deletions_created ON account_deletions (created)';

  it('normalizes legacy index terminators from the production inventory', () => {
    const schema = applyIndexInventory(
      [
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
          indexes: ['CREATE INDEX idx_progress_notes_project ON progress_notes (project);'],
        },
      ],
      {
        $deployedThroughMigration: deployedThroughMigration,
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

  it('keeps an index added by a migration that production has not run', () => {
    const schema = applyIndexInventory(
      [{ id: 'deletions', name: 'account_deletions', indexes: [unreleasedIndex] }],
      { $deployedThroughMigration: deployedThroughMigration, account_deletions: [] },
      {
        migrations: [
          { name: '1791129600_account_deletion.js', source: '// creates account_deletions' },
          {
            name: '1792281600_account_deletion_worker.js',
            source: `db.newQuery("${unreleasedIndex}")`,
          },
        ],
      }
    );

    expect(schema).toEqual([
      { id: 'deletions', name: 'account_deletions', indexes: [unreleasedIndex] },
    ]);
  });

  it.each([
    ['no migration creates it', []],
    [
      'only a deployed migration creates it',
      [{ name: '1791129600_account_deletion.js', source: unreleasedIndex }],
    ],
  ])('fails when production lacks a schema index and %s', (_label, migrations) => {
    expect(() =>
      applyIndexInventory(
        [{ id: 'deletions', name: 'account_deletions', indexes: [unreleasedIndex] }],
        { $deployedThroughMigration: deployedThroughMigration, account_deletions: [] },
        { migrations }
      )
    ).toThrow(/production index inventory lacks account_deletions\.idx_account_deletions_created/i);
  });

  it('keeps production-only indexes so schema drift still fails the comparison', () => {
    const productionOnly = 'CREATE INDEX idx_artists_name ON artists (name)';
    expect(
      applyIndexInventory([{ id: 'artists', name: 'artists', indexes: [] }], {
        $deployedThroughMigration: deployedThroughMigration,
        artists: [productionOnly],
      })
    ).toEqual([{ id: 'artists', name: 'artists', indexes: [productionOnly] }]);
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
