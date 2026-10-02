// @ts-nocheck

const USERS_COLLECTION_ID = '_pb_users_auth_';
const FIELD_NAME = 'theme_palette';

function hasField(collection, name) {
  for (let i = 0; i < collection.fields.length; i++) {
    if (collection.fields[i].name === name) {
      return true;
    }
  }
  return false;
}

function refuseDestructiveRollback(reason) {
  throw new Error(`Refusing destructive rollback: ${reason}`);
}

migrate(
  app => {
    const collection = app.findCollectionByNameOrId(USERS_COLLECTION_ID);

    if (hasField(collection, FIELD_NAME)) {
      return;
    }

    collection.fields.add(
      new Field({
        hidden: false,
        id: 'select_theme_palette',
        maxSelect: 1,
        name: FIELD_NAME,
        presentable: false,
        required: false,
        system: false,
        type: 'select',
        values: ['lilac-dusk', 'raspberry-sunrise'],
      })
    );

    app.save(collection);
  },
  app => {
    refuseDestructiveRollback('rolling back would delete users.theme_palette values');
  }
);
