// @ts-nocheck

const COLORING_TAGS_COLLECTION_ID = 'pbc_2820000007';
const COLORING_BOOK_TAGS_COLLECTION_ID = 'pbc_2820000005';
const DIAMOND_TAGS_COLLECTION_ID = 'pbc_1219621782';
const BOOK_TAG_INDEXES_BOOK_ONLY = [
  'CREATE INDEX `idx_coloring_book_tags_book` ON `coloring_book_tags` (`book`)',
];
const BOOK_TAG_INDEXES_WITH_TAG = [
  'CREATE INDEX `idx_coloring_book_tags_book` ON `coloring_book_tags` (`book`)',
  'CREATE INDEX `idx_coloring_book_tags_tag` ON `coloring_book_tags` (`tag`)',
  'CREATE UNIQUE INDEX `idx_coloring_book_tags_book_tag_unique` ON `coloring_book_tags` (`book`, `tag`)',
];

function idField() {
  return {
    autogeneratePattern: '[a-z0-9]{15}',
    hidden: false,
    id: 'text3208210256',
    max: 15,
    min: 15,
    name: 'id',
    pattern: '^[a-z0-9]+$',
    presentable: false,
    primaryKey: true,
    required: true,
    system: true,
    type: 'text',
  };
}

function autodateField(id, name, onCreate, onUpdate) {
  return {
    hidden: false,
    id,
    name,
    onCreate,
    onUpdate,
    presentable: false,
    system: false,
    type: 'autodate',
  };
}

function textField(id, name, required, max = 0, pattern = '') {
  return {
    autogeneratePattern: '',
    hidden: false,
    id,
    max,
    min: required ? 1 : 0,
    name,
    pattern,
    presentable: false,
    primaryKey: false,
    required,
    system: false,
    type: 'text',
  };
}

function relationField(id, name, collectionId, required, cascadeDelete) {
  return {
    cascadeDelete,
    collectionId,
    hidden: false,
    id,
    maxSelect: 1,
    minSelect: 0,
    name,
    presentable: false,
    required,
    system: false,
    type: 'relation',
  };
}

function replaceBookTagRelation(app, collectionId) {
  const bookTags = app.findCollectionByNameOrId(COLORING_BOOK_TAGS_COLLECTION_ID);

  bookTags.createRule = 'book.user = @request.auth.id';
  bookTags.deleteRule = 'book.user = @request.auth.id';
  bookTags.listRule = 'book.user = @request.auth.id';
  bookTags.updateRule = 'book.user = @request.auth.id';
  bookTags.viewRule = 'book.user = @request.auth.id';
  unmarshal({ indexes: BOOK_TAG_INDEXES_BOOK_ONLY }, bookTags);
  bookTags.fields.removeByName('tag');
  app.save(bookTags);

  bookTags.fields.add(new Field(relationField('relation_tag', 'tag', collectionId, true, true)));
  unmarshal({ indexes: BOOK_TAG_INDEXES_WITH_TAG }, bookTags);
  app.save(bookTags);
}

function ensureColoringTagForDiamondTag(app, diamondTagId, cache) {
  if (cache[diamondTagId]) return cache[diamondTagId];

  const diamondTag = app.findRecordById(DIAMOND_TAGS_COLLECTION_ID, diamondTagId);
  const existing = arrayOf(new DynamicModel({ id: '' }));
  app
    .db()
    .newQuery('SELECT id FROM coloring_tags WHERE user = {:user} AND name = {:name} LIMIT 1')
    .bind({
      user: diamondTag.get('user'),
      name: diamondTag.get('name'),
    })
    .all(existing);

  if (existing.length > 0) {
    cache[diamondTagId] = existing[0].id;
    return existing[0].id;
  }

  const collection = app.findCollectionByNameOrId(COLORING_TAGS_COLLECTION_ID);
  const coloringTag = new Record(collection);
  coloringTag.set('user', diamondTag.get('user'));
  coloringTag.set('name', diamondTag.get('name'));
  coloringTag.set('slug', diamondTag.get('slug'));
  coloringTag.set('color', diamondTag.get('color'));
  app.save(coloringTag);

  cache[diamondTagId] = coloringTag.id;
  return coloringTag.id;
}

function refuseDestructiveRollback(reason) {
  throw new Error(`Refusing destructive rollback: ${reason}`);
}

migrate(
  app => {
    app.save(
      new Collection({
        createRule: 'user = @request.auth.id',
        deleteRule: 'user = @request.auth.id',
        fields: [
          idField(),
          relationField('relation2375276105', 'user', '_pb_users_auth_', true, true),
          textField('text946041333', 'name', true, 100),
          textField('text2769383554', 'slug', true, 100),
          textField('text1488720958', 'color', true, 7, '^#[0-9a-fA-F]{6}$'),
          autodateField('autodate2990389176', 'created', true, false),
          autodateField('autodate3332085495', 'updated', true, true),
        ],
        id: COLORING_TAGS_COLLECTION_ID,
        indexes: [
          'CREATE INDEX `idx_coloring_tags_user` ON `coloring_tags` (`user`)',
          'CREATE UNIQUE INDEX `idx_coloring_tags_user_name` ON `coloring_tags` (`user`, `name`)',
        ],
        listRule: 'user = @request.auth.id',
        name: 'coloring_tags',
        system: false,
        type: 'base',
        updateRule: 'user = @request.auth.id',
        viewRule: 'user = @request.auth.id',
      })
    );

    const migratedTagIds = {};
    const joins = arrayOf(new DynamicModel({ id: '', tag: '' }));
    app.db().newQuery('SELECT id, tag FROM coloring_book_tags').all(joins);

    joins.forEach(join => {
      ensureColoringTagForDiamondTag(app, join.tag, migratedTagIds);
    });

    replaceBookTagRelation(app, COLORING_TAGS_COLLECTION_ID);

    joins.forEach(join => {
      const record = app.findRecordById(COLORING_BOOK_TAGS_COLLECTION_ID, join.id);
      record.set('tag', migratedTagIds[join.tag]);
      app.save(record);
    });
  },
  app => {
    refuseDestructiveRollback(
      'rolling back would move coloring tags into the diamond tags collection, rewrite coloring_book_tags.tag, and delete coloring_tags user data'
    );
  }
);
