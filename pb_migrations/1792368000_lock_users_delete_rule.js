/// <reference path="../pb_data/types.d.ts" />

const USERS_COLLECTION_ID = '_pb_users_auth_';
const PREVIOUS_DELETE_RULE = '@request.auth.verified = true && (id = @request.auth.id)';

migrate(
  app => {
    const users = app.findCollectionByNameOrId(USERS_COLLECTION_ID);
    users.deleteRule = null;
    app.save(users);
  },
  app => {
    const users = app.findCollectionByNameOrId(USERS_COLLECTION_ID);
    users.deleteRule = PREVIOUS_DELETE_RULE;
    app.save(users);
  }
);
