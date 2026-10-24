/// <reference path="../pb_data/types.d.ts" />

const USERS_COLLECTION_ID = '_pb_users_auth_';

migrate(
  app => {
    const users = app.findCollectionByNameOrId(USERS_COLLECTION_ID);
    users.deleteRule = null;
    app.save(users);
  },
  () => {
    // Rolling back must not reopen direct account deletion.
  }
);
