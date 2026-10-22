import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it, vi } from 'vitest';

import {
  applyIndexInventory,
  assertUpgradeChangeContract,
  classifyUpgradeChanges,
  collectUpgradeChanges,
  parseChangedPaths,
  readBaseMigrations,
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

  const inventoryThroughMigration = '1789940324_enforce_verified_auth.js';
  const unreleasedIndex =
    'CREATE INDEX idx_account_deletions_created ON account_deletions (created)';
  const migrationSource = (up, down = '') => `/// <reference path="../pb_data/types.d.ts" />

migrate(
  app => {
${up}
  },
  app => {
${down}
  }
);
`;
  const addAuditIndex =
    index => `    const audits = app.findCollectionByNameOrId('account_deletions');
    audits.indexes = [...audits.indexes, '${index}'];
    app.save(audits);`;
  const applyWithUnreleased = source =>
    applyIndexInventory(
      [{ id: 'deletions', name: 'account_deletions', indexes: [unreleasedIndex] }],
      { $inventoryThroughMigration: inventoryThroughMigration, account_deletions: [] },
      { migrations: [{ name: '1792281600_account_deletion_worker.js', source }] }
    );

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
        $inventoryThroughMigration: inventoryThroughMigration,
        progress_notes: ['CREATE INDEX idx_progress_notes_project ON progress_notes (project);'],
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
      { $inventoryThroughMigration: inventoryThroughMigration, account_deletions: [] },
      {
        migrations: [
          { name: '1791129600_account_deletion.js', source: '// creates account_deletions' },
          {
            name: '1792281600_account_deletion_worker.js',
            source: migrationSource(
              addAuditIndex(
                'create   index IDX_account_deletions_created\\n      ON account_deletions (created);'
              )
            ),
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
      'only an inventoried migration creates it',
      [{ name: '1789000000_account_deletion.js', source: unreleasedIndex }],
    ],
  ])('fails when production lacks a schema index and %s', (_label, migrations) => {
    expect(() =>
      applyIndexInventory(
        [{ id: 'deletions', name: 'account_deletions', indexes: [unreleasedIndex] }],
        { $inventoryThroughMigration: inventoryThroughMigration, account_deletions: [] },
        { migrations }
      )
    ).toThrow(/production index inventory lacks account_deletions\.idx_account_deletions_created/i);
  });

  it.each([
    [
      'only a comment names it',
      migrationSource(
        `    // TODO: add idx_account_deletions_created later\n    app.save(app.findCollectionByNameOrId('account_deletions'));`
      ),
    ],
    [
      'only a commented-out create names it',
      migrationSource(`    /* ${addAuditIndex(unreleasedIndex)} */`),
    ],
    [
      'the up step only drops it',
      migrationSource(
        "    app.db().newQuery('DROP INDEX IF EXISTS idx_account_deletions_created').execute();"
      ),
    ],
    ['only the down step creates it', migrationSource('', addAuditIndex(unreleasedIndex))],
    [
      'the up step creates a different definition',
      migrationSource(
        addAuditIndex('CREATE INDEX idx_account_deletions_created ON account_deletions (updated)')
      ),
    ],
    [
      'the up step creates it on a different collection',
      migrationSource(
        addAuditIndex(
          'CREATE INDEX idx_account_deletions_created ON account_deletion_jobs (created)'
        )
      ),
    ],
    ['the source is not a migration', `db.newQuery("${unreleasedIndex}")`],
  ])('rejects index evidence when %s', (_label, source) => {
    expect(() => applyWithUnreleased(source)).toThrow(
      /production index inventory lacks account_deletions\.idx_account_deletions_created/i
    );
  });

  it('accepts the real account deletion worker migration as evidence', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'pb_migrations/1792281600_account_deletion_worker.js'),
      'utf8'
    );
    expect(applyWithUnreleased(source)).toEqual([
      { id: 'deletions', name: 'account_deletions', indexes: [unreleasedIndex] },
    ]);
  });

  it('fails when an inventoried-era collection has no entry', () => {
    const grantIndex =
      'CREATE INDEX idx_apple_grant_user_state ON apple_oauth_grants (user_id, state)';
    expect(() =>
      applyIndexInventory(
        [{ id: 'grants', name: 'apple_oauth_grants', indexes: [grantIndex] }],
        { $inventoryThroughMigration: inventoryThroughMigration },
        { migrations: [{ name: '1789000000_apple_grants.js', source: grantIndex }] }
      )
    ).toThrow(/production index inventory lacks apple_oauth_grants\.idx_apple_grant_user_state/i);
  });

  it('accepts a collection created after the inventory boundary', () => {
    const jobIndex = 'CREATE INDEX idx_jobs_created ON deletion_jobs (created);';
    expect(
      applyIndexInventory(
        [{ id: 'jobs', name: 'deletion_jobs', indexes: [jobIndex] }],
        { $inventoryThroughMigration: inventoryThroughMigration },
        {
          migrations: [
            {
              name: '1792281600_deletion_jobs.js',
              source: migrationSource(
                `    app.save(new Collection({ name: 'deletion_jobs', indexes: ['${jobIndex}'] }));`
              ),
            },
          ],
        }
      )
    ).toEqual([{ id: 'jobs', name: 'deletion_jobs', indexes: [jobIndex.replace(/;$/, '')] }]);
  });

  it('ignores branch-local migrations as evidence for a missing index', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'og-upgrade-evidence-'));
    const gitFn = args => {
      const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr);
      return result.stdout;
    };
    try {
      gitFn(['init', '-q']);
      mkdirSync(path.join(directory, 'pb_migrations'));
      writeFileSync(path.join(directory, '.gitignore'), 'pb_migrations/*_local.js\n');
      writeFileSync(path.join(directory, 'pb_migrations', '1700000000_base.js'), '// base\n');
      gitFn(['add', '.']);
      gitFn(['-c', 'user.name=t', '-c', 'user.email=t@example.test', 'commit', '-qm', 'base']);
      writeFileSync(path.join(directory, 'pb_migrations', '1800000000_local.js'), unreleasedIndex);
      writeFileSync(path.join(directory, 'pb_migrations', '1800000001_new.js'), unreleasedIndex);

      const migrations = readBaseMigrations({ baseCommit: 'HEAD', gitFn });
      expect(migrations).toEqual([{ name: '1700000000_base.js', source: '// base\n' }]);
      expect(() =>
        applyIndexInventory(
          [{ id: 'deletions', name: 'account_deletions', indexes: [unreleasedIndex] }],
          { $inventoryThroughMigration: '1600000000_old.js', account_deletions: [] },
          { migrations }
        )
      ).toThrow(/production index inventory lacks/i);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps production-only indexes so schema drift still fails the comparison', () => {
    const productionOnly = 'CREATE INDEX idx_artists_name ON artists (name)';
    expect(
      applyIndexInventory([{ id: 'artists', name: 'artists', indexes: [] }], {
        $inventoryThroughMigration: inventoryThroughMigration,
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
