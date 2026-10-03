/// <reference path="../pb_data/types.d.ts" />

const LEGACY_INDEXES = {
  coloring_books: [
    'CREATE INDEX `idx_coloring_books_completion_percentage` ON `coloring_books` (`completion_percentage`);',
    'CREATE INDEX `idx_coloring_books_last_activity_at` ON `coloring_books` (`last_activity_at`);',
  ],
  progress_notes: ['CREATE INDEX idx_progress_notes_project ON progress_notes (project);'],
  projects: [
    'CREATE INDEX idx_projects_user_status_date_started ON projects (user, status, date_started);',
    'CREATE INDEX idx_projects_user_date_completed ON projects (user, date_completed);',
    'CREATE INDEX IF NOT EXISTS idx_projects_date_received ON projects (date_received) WHERE date_received IS NOT NULL;',
    'CREATE INDEX IF NOT EXISTS idx_projects_date_purchased ON projects (date_purchased) WHERE date_purchased IS NOT NULL;',
    'CREATE INDEX IF NOT EXISTS idx_projects_user_date_received ON projects (user, date_received) WHERE date_received IS NOT NULL;',
    'CREATE INDEX IF NOT EXISTS idx_projects_user_date_purchased ON projects (user, date_purchased) WHERE date_purchased IS NOT NULL;',
    "CREATE INDEX IF NOT EXISTS idx_projects_year_completed ON projects (strftime('%Y', date_completed)) WHERE date_completed IS NOT NULL;",
  ],
};

const stripIndexTerminator = index => index.replace(/;\s*$/, '');

migrate(
  app => {
    let changed = false;
    Object.entries(LEGACY_INDEXES).forEach(([name, legacyIndexes]) => {
      const collection = app.findCollectionByNameOrId(name);
      const original = JSON.stringify(collection.indexes);
      const legacySet = new Set(legacyIndexes.map(stripIndexTerminator));
      const indexes = collection.indexes.map(index =>
        legacySet.has(stripIndexTerminator(index)) ? stripIndexTerminator(index) : index
      );
      const normalized = JSON.stringify(indexes);
      if (normalized === original) return;

      // Saving the collection cannot repair metadata its old index parser rejects.
      const result = app
        .db()
        .newQuery(
          'UPDATE _collections SET indexes = {:indexes} WHERE id = {:id} AND indexes = {:original}'
        )
        .bind({ indexes: normalized, id: collection.id, original })
        .execute();
      if (result.rowsAffected() !== 1) throw new Error(`Index metadata changed for ${name}`);
      changed = true;
    });
    if (changed) app.reloadCachedCollections();
  },
  () => {
    // Restoring parser-invalid metadata would prevent later collection updates.
  }
);
