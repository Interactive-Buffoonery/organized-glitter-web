// @ts-nocheck

const USERS_COLLECTION_ID = '_pb_users_auth_';
const FIELD_NAME = 'coloring_walkthrough_seen';

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
        id: 'bool_coloring_walkthrough_seen',
        name: FIELD_NAME,
        presentable: false,
        required: false,
        system: false,
        type: 'bool',
      })
    );

    app.save(collection);
  },
  app => {
    refuseDestructiveRollback('rolling back would delete users.coloring_walkthrough_seen values');
  }
);
