const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { validateMigrationSource } = require('../validate-migration.cjs');

describe('validate-migration', () => {
  it('fails when a down function deletes a collection', () => {
    const findings = validateMigrationSource(`
      migrate(
        app => {},
        app => {
          app.delete(app.findCollectionByNameOrId('coloring_tags'));
        }
      );
    `);

    assert.equal(findings.length, 1);
    assert.match(findings[0].detail, /app\.delete/);
  });

  it('fails when a down function removes a field', () => {
    const findings = validateMigrationSource(`
      migrate(
        app => {},
        app => {
          const collection = app.findCollectionByNameOrId('_pb_users_auth_');
          collection.fields.removeByName('coloring_walkthrough_seen');
          app.save(collection);
        }
      );
    `);

    assert.equal(findings.length, 1);
    assert.match(findings[0].detail, /fields\.removeByName/);
  });

  it('ignores rollback refusal words inside comments and strings', () => {
    const findings = validateMigrationSource(`
      migrate(
        app => {},
        app => {
          // throw before deleting
          const message = 'refuseDestructiveRollback';
          app.delete(app.findCollectionByNameOrId('coloring_tags'));
        }
      );
    `);

    assert.equal(findings.length, 1);
    assert.match(findings[0].detail, /app\.delete/);
  });

  it('passes when a down function throws before destructive work', () => {
    const findings = validateMigrationSource(`
      migrate(
        app => {},
        app => {
          throw new Error('Refusing destructive rollback');
          app.delete(app.findCollectionByNameOrId('coloring_tags'));
        }
      );
    `);

    assert.deepEqual(findings, []);
  });

  it('passes when a down function refuses through the local helper before destructive work', () => {
    const findings = validateMigrationSource(`
      function refuseDestructiveRollback(reason) {
        throw new Error(reason);
      }

      migrate(
        app => {},
        app => {
          refuseDestructiveRollback('Refusing destructive rollback');
          app.delete(app.findCollectionByNameOrId('coloring_tags'));
        }
      );
    `);

    assert.deepEqual(findings, []);
  });

  it('passes when a down function removes indexes only', () => {
    const findings = validateMigrationSource(`
      migrate(
        app => {},
        app => {
          const collection = app.findCollectionByNameOrId('coloring_pages');
          collection.indexes = collection.indexes.filter(index => !index.includes('idx_name'));
          app.save(collection);
        }
      );
    `);

    assert.deepEqual(findings, []);
  });

  it('passes for the current stats readiness migration', () => {
    const migrationPath = path.resolve(
      __dirname,
      '../../pb_migrations/1778600000_int_306_stats_native_readiness.js'
    );
    const findings = validateMigrationSource(fs.readFileSync(migrationPath, 'utf8'), migrationPath);

    assert.deepEqual(findings, []);
  });
});
