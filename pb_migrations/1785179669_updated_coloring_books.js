/// <reference path="../pb_data/types.d.ts" />
migrate(
  app => {
    const collection = app.findCollectionByNameOrId('pbc_2820000003');

    // update collection data
    unmarshal(
      {
        createRule:
          'user = @request.auth.id && (publisher = "" || publisher.user = @request.auth.id) && (illustrator = "" || illustrator.user = @request.auth.id)',
        updateRule:
          'user = @request.auth.id && (publisher = "" || publisher.user = @request.auth.id) && (illustrator = "" || illustrator.user = @request.auth.id)',
      },
      collection
    );

    return app.save(collection);
  },
  app => {
    const collection = app.findCollectionByNameOrId('pbc_2820000003');

    // update collection data
    unmarshal(
      {
        createRule: 'user = @request.auth.id',
        updateRule: 'user = @request.auth.id',
      },
      collection
    );

    return app.save(collection);
  }
);
