// @ts-nocheck

const USERS_COLLECTION_ID = '_pb_users_auth_';
const FIELD_NAME = 'analytics_opt_out';

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
        help: '',
        hidden: false,
        id: 'bool_analytics_opt_out',
        name: FIELD_NAME,
        presentable: false,
        required: false,
        system: false,
        type: 'bool',
      })
    );

    app.save(collection);
  },
  () => {
    refuseDestructiveRollback('rolling back would delete users.analytics_opt_out values');
  }
);
