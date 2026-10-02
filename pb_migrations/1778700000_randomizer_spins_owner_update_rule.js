/// <reference path="../pb_data/types.d.ts" />

const RANDOMIZER_SPINS_COLLECTION_ID = 'pbc_4013924363';
const OWNER_RULE = 'user = @request.auth.id';
const PUBLIC_RULE = '';

migrate(
  app => {
    const collection = app.findCollectionByNameOrId(RANDOMIZER_SPINS_COLLECTION_ID);
    collection.updateRule = OWNER_RULE;
    app.save(collection);
  },
  app => {
    const collection = app.findCollectionByNameOrId(RANDOMIZER_SPINS_COLLECTION_ID);
    collection.updateRule = PUBLIC_RULE;
    app.save(collection);
  }
);
