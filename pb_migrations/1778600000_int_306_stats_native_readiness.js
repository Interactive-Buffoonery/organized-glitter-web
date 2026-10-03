/// <reference path="../pb_data/types.d.ts" />

const COLORING_BOOKS_COLLECTION_ID = 'pbc_2820000003';
const COLORING_PAGES_COLLECTION_ID = 'pbc_2820000004';
const COLORING_PROGRESS_NOTES_COLLECTION_ID = 'pbc_4218181872';

const COLORING_BOOK_INDEXES = [
  'CREATE INDEX `idx_coloring_books_user_status` ON `coloring_books` (`user`, `status`)',
  'CREATE INDEX `idx_coloring_books_user_last_activity_at` ON `coloring_books` (`user`, `last_activity_at`)',
];

const COLORING_PAGE_INDEXES = [
  'CREATE INDEX `idx_coloring_pages_status` ON `coloring_pages` (`status`)',
  'CREATE INDEX `idx_coloring_pages_completed_at` ON `coloring_pages` (`completed_at`)',
  'CREATE INDEX `idx_coloring_pages_book_status` ON `coloring_pages` (`book`, `status`)',
];

const PROGRESS_NOTE_RULE = 'user = @request.auth.id && page.book.user = @request.auth.id';
const LEGACY_PROGRESS_NOTE_RULE = 'user = @request.auth.id\n';

function getIndexName(index) {
  const match = index.match(/`(idx_[^`]+)`/);
  return match ? match[1] : '';
}

function addIndex(collection, index) {
  const indexName = getIndexName(index);
  if (!indexName || collection.indexes.some(existing => existing.includes(`\`${indexName}\``))) {
    return;
  }

  collection.indexes.push(index);
}

function removeIndex(collection, indexName) {
  collection.indexes = collection.indexes.filter(index => !index.includes(`\`${indexName}\``));
}

function setProgressNoteRules(collection, rule) {
  collection.listRule = rule;
  collection.viewRule = rule;
  collection.createRule = rule;
  collection.updateRule = rule;
  collection.deleteRule = rule;
}

migrate(
  app => {
    const books = app.findCollectionByNameOrId(COLORING_BOOKS_COLLECTION_ID);
    COLORING_BOOK_INDEXES.forEach(index => addIndex(books, index));
    app.save(books);

    const pages = app.findCollectionByNameOrId(COLORING_PAGES_COLLECTION_ID);
    COLORING_PAGE_INDEXES.forEach(index => addIndex(pages, index));
    app.save(pages);

    const progressNotes = app.findCollectionByNameOrId(COLORING_PROGRESS_NOTES_COLLECTION_ID);
    setProgressNoteRules(progressNotes, PROGRESS_NOTE_RULE);
    app.save(progressNotes);
  },
  app => {
    const books = app.findCollectionByNameOrId(COLORING_BOOKS_COLLECTION_ID);
    COLORING_BOOK_INDEXES.map(getIndexName).forEach(indexName => removeIndex(books, indexName));
    app.save(books);

    const pages = app.findCollectionByNameOrId(COLORING_PAGES_COLLECTION_ID);
    COLORING_PAGE_INDEXES.map(getIndexName).forEach(indexName => removeIndex(pages, indexName));
    app.save(pages);

    const progressNotes = app.findCollectionByNameOrId(COLORING_PROGRESS_NOTES_COLLECTION_ID);
    setProgressNoteRules(progressNotes, LEGACY_PROGRESS_NOTE_RULE);
    app.save(progressNotes);
  }
);
