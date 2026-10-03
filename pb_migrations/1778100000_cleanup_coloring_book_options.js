// @ts-nocheck

const COLORING_BOOKS_COLLECTION_ID = 'pbc_2820000003';

const REMOVED_FIELDS = [
  'purchase_location',
  'price_paid',
  'storage_location',
  'binding',
  'page_layout',
  'paper_type',
  'perforated_pages',
  'difficulty',
  'mediums',
];

const REMOVED_INDEXES = [
  'idx_coloring_books_book_format',
  'idx_coloring_books_page_layout',
  'idx_coloring_books_paper_type',
  'idx_coloring_books_difficulty',
  'idx_coloring_books_date_purchased',
  'idx_coloring_books_publication_year',
];

function textField(id, name) {
  return {
    autogeneratePattern: '',
    hidden: false,
    id,
    max: 0,
    min: 0,
    name,
    pattern: '',
    presentable: false,
    primaryKey: false,
    required: false,
    system: false,
    type: 'text',
  };
}

function numberField(id, name, onlyInt, min = null, max = null) {
  return {
    hidden: false,
    id,
    max,
    min,
    name,
    onlyInt,
    presentable: false,
    required: false,
    system: false,
    type: 'number',
  };
}

function selectField(id, name, values, maxSelect = 1) {
  return {
    hidden: false,
    id,
    maxSelect,
    name,
    presentable: false,
    required: false,
    system: false,
    type: 'select',
    values,
  };
}

function boolField(id, name) {
  return {
    hidden: false,
    id,
    name,
    presentable: false,
    required: false,
    system: false,
    type: 'bool',
  };
}

const FIELD_DEFINITIONS = [
  textField('text_purchase_location', 'purchase_location'),
  numberField('number_price_paid', 'price_paid', false, 0),
  textField('text_storage_location', 'storage_location'),
  selectField('select_binding', 'binding', [
    'paperback',
    'hardcover',
    'spiral_bound',
    'staple_bound',
    'loose_pages',
    'other',
  ]),
  selectField('select_page_layout', 'page_layout', [
    'single_sided',
    'double_sided',
    'mixed',
    'unknown',
  ]),
  selectField('select_paper_type', 'paper_type', [
    'standard',
    'cardstock',
    'watercolor',
    'marker_friendly',
    'digital',
    'unknown',
  ]),
  boolField('bool_perforated_pages', 'perforated_pages'),
  selectField('select_difficulty', 'difficulty', [
    'easy',
    'moderate',
    'detailed',
    'intricate',
    'mixed',
    'unknown',
  ]),
  selectField(
    'select_mediums',
    'mediums',
    [
      'colored_pencils',
      'alcohol_markers',
      'water_based_markers',
      'gel_pens',
      'watercolor',
      'acrylic_markers',
      'pastels',
      'mixed_media',
    ],
    8
  ),
];

const RESTORED_INDEXES = [
  'CREATE INDEX `idx_coloring_books_book_format` ON `coloring_books` (`book_format`)',
  'CREATE INDEX `idx_coloring_books_page_layout` ON `coloring_books` (`page_layout`)',
  'CREATE INDEX `idx_coloring_books_paper_type` ON `coloring_books` (`paper_type`)',
  'CREATE INDEX `idx_coloring_books_difficulty` ON `coloring_books` (`difficulty`)',
  'CREATE INDEX `idx_coloring_books_date_purchased` ON `coloring_books` (`date_purchased`)',
  'CREATE INDEX `idx_coloring_books_publication_year` ON `coloring_books` (`publication_year`)',
];

function hasField(collection, name) {
  for (let i = 0; i < collection.fields.length; i++) {
    if (collection.fields[i].name === name) return true;
  }
  return false;
}

function removeIndex(collection, indexName) {
  collection.indexes = collection.indexes.filter(index => !index.includes(`\`${indexName}\``));
}

function addIndex(collection, index) {
  const match = index.match(/`(idx_[^`]+)`/);
  const indexName = match ? match[1] : '';
  if (!indexName || collection.indexes.some(existing => existing.includes(`\`${indexName}\``))) {
    return;
  }
  collection.indexes.push(index);
}

migrate(
  app => {
    const books = app.findCollectionByNameOrId(COLORING_BOOKS_COLLECTION_ID);

    REMOVED_INDEXES.forEach(indexName => removeIndex(books, indexName));
    REMOVED_FIELDS.forEach(fieldName => {
      if (hasField(books, fieldName)) {
        books.fields.removeByName(fieldName);
      }
    });

    app.save(books);
  },
  app => {
    const books = app.findCollectionByNameOrId(COLORING_BOOKS_COLLECTION_ID);

    // Restores legacy schema shape only; historical field values cannot be recovered.
    FIELD_DEFINITIONS.forEach(field => {
      if (!hasField(books, field.name)) {
        books.fields.add(new Field(field));
      }
    });
    RESTORED_INDEXES.forEach(index => addIndex(books, index));

    app.save(books);
  }
);
