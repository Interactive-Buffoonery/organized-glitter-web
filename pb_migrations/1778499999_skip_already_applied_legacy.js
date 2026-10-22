/// <reference path="../pb_data/types.d.ts" />

// Production already holds the effects of the three files below (and stronger
// verified rules), but never recorded them. Replaying them fails on duplicate
// indexes and weakens rules, so record them as applied when that is the case.
// Fresh installs lack these effects and still run all three normally.
const LEGACY_FILES = [
  '1778500000_add_users_coloring_walkthrough_seen.js',
  '1778600000_int_306_stats_native_readiness.js',
  '1778700000_randomizer_spins_owner_update_rule.js',
];
const VERIFIED = '@request.auth.verified';
const RULE_FIELDS = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'];

// JSVM exposes nullable rules as *string objects, so compare their text.
const isVerified = rule => rule != null && String(rule).includes(VERIFIED);

const findCollection = (app, id) => {
  try {
    return app.findCollectionByNameOrId(id);
  } catch (error) {
    return null;
  }
};

migrate(
  app => {
    const users = findCollection(app, '_pb_users_auth_');
    const notes = findCollection(app, 'pbc_4218181872');
    const spins = findCollection(app, 'pbc_4013924363');
    const alreadyApplied =
      users?.fields.getByName('coloring_walkthrough_seen') &&
      notes &&
      RULE_FIELDS.every(field => isVerified(notes[field])) &&
      spins &&
      isVerified(spins.updateRule);
    if (!alreadyApplied) return;

    const applied = Date.now() * 1000;
    LEGACY_FILES.forEach(file => {
      app
        .db()
        .newQuery(
          'INSERT OR IGNORE INTO {{_migrations}} (file, applied) VALUES ({:file}, {:applied})'
        )
        .bind({ file, applied })
        .execute();
    });
  },
  () => {
    // Removing the history rows would make the legacy files replay and fail.
  }
);
