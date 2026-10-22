/// <reference path="../pb_data/types.d.ts" />

// Production holds the effects of the three files below (with stronger verified
// rules) but never recorded them. Replaying them fails on duplicate indexes and
// weakens rules, so each file is recorded as applied when its own effects are
// present. Fresh installs lack them and still run all three normally.
const VERIFIED = '@request.auth.verified';
const RULE_FIELDS = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'];
const STATS_INDEXES = {
  pbc_2820000003: ['idx_coloring_books_user_status', 'idx_coloring_books_user_last_activity_at'],
  pbc_2820000004: [
    'idx_coloring_pages_status',
    'idx_coloring_pages_completed_at',
    'idx_coloring_pages_book_status',
  ],
};

// JSVM exposes nullable rules as *string objects, so compare their text.
const isVerified = rule => rule != null && String(rule).includes(VERIFIED);

const findCollection = (app, id) => {
  try {
    return app.findCollectionByNameOrId(id);
  } catch (error) {
    return null;
  }
};

// Full identifier, bare or quoted with backticks, double quotes or brackets.
const indexName = index => {
  const match = String(index).match(
    /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`([^`]+)`|"([^"]+)"|\[([^\]]+)\]|(\w+)(?![^\s(]))/i
  );
  return match ? match.slice(1).find(Boolean) : undefined;
};

const hasStatsIndexes = app =>
  Object.entries(STATS_INDEXES).every(([id, names]) => {
    const collection = findCollection(app, id);
    const existing = collection ? collection.indexes.map(indexName) : [];
    return names.every(name => existing.includes(name));
  });

// Newest first, so the three keep their relative order as the oldest history.
const CHECKS = [
  [
    '1778700000_randomizer_spins_owner_update_rule.js',
    app => isVerified(findCollection(app, 'pbc_4013924363')?.updateRule),
  ],
  [
    // ponytail: a partial set of unquoted stats indexes lets 1778600000 replay and
    // fail on the duplicate name; the run rolls back loudly and production has all
    // five. Fix if needed: quote the existing definitions before replay.
    '1778600000_int_306_stats_native_readiness.js',
    app => {
      const notes = findCollection(app, 'pbc_4218181872');
      return (
        !!notes && RULE_FIELDS.every(field => isVerified(notes[field])) && hasStatsIndexes(app)
      );
    },
  ],
  [
    '1778500000_add_users_coloring_walkthrough_seen.js',
    app => !!findCollection(app, '_pb_users_auth_')?.fields.getByName('coloring_walkthrough_seen'),
  ],
];

// `migrate down` picks rows by this normalized key, newest first. Recording the
// files just below the oldest key keeps a rollback of later migrations from
// reaching their down steps.
const RECORD_AS_OLDEST = `
  INSERT OR IGNORE INTO {{_migrations}} (file, applied)
  SELECT {:file}, COALESCE(CAST(MIN(substr(applied||'0000000000000000', 0, 17)) AS INTEGER), {:now}) - 1
  FROM {{_migrations}}
`;

migrate(
  app => {
    CHECKS.forEach(([file, isApplied]) => {
      if (!isApplied(app)) return;
      app
        .db()
        .newQuery(RECORD_AS_OLDEST)
        .bind({ file, now: Date.now() * 1000 })
        .execute();
    });
  },
  () => {
    // Removing the history rows would make the legacy files replay and fail.
  }
);
