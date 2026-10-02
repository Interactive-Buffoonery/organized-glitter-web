/// <reference path="../pb_data/types.d.ts" />

const PRODUCTION_BOOK_INDEXES = [
  'CREATE INDEX idx_coloring_books_user_status\nON coloring_books (user, status);',
  'CREATE INDEX idx_coloring_books_user_last_activity_at ON coloring_books (user, last_activity_at);',
];

const stripIndexTerminator = index => index.replace(/;\s*$/, '');

migrate(
  app => {
    const collection = app.findCollectionByNameOrId('coloring_books');
    const original = JSON.stringify(collection.indexes);
    const legacySet = new Set(PRODUCTION_BOOK_INDEXES.map(stripIndexTerminator));
    const indexes = collection.indexes.map(index =>
      legacySet.has(stripIndexTerminator(index)) ? stripIndexTerminator(index) : index
    );
    const normalized = JSON.stringify(indexes);
    if (normalized === original) return;

    // The old definitions cannot be parsed by the normal collection-save path.
    const result = app
      .db()
      .newQuery(
        'UPDATE _collections SET indexes = {:indexes} WHERE id = {:id} AND indexes = {:original}'
      )
      .bind({ indexes: normalized, id: collection.id, original })
      .execute();
    if (result.rowsAffected() !== 1) throw new Error('Index metadata changed for coloring_books');
    app.reloadCachedCollections();
  },
  () => {
    // Keep valid metadata when rolling back; physical indexes were not changed.
  }
);
