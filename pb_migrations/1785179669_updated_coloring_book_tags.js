/// <reference path="../pb_data/types.d.ts" />
migrate(
  app => {
    const collection = app.findCollectionByNameOrId('pbc_2820000005');

    // update collection data
    unmarshal(
      {
        createRule: 'book.user = @request.auth.id && tag.user = @request.auth.id',
        updateRule: 'book.user = @request.auth.id && tag.user = @request.auth.id',
      },
      collection
    );

    return app.save(collection);
  },
  app => {
    const collection = app.findCollectionByNameOrId('pbc_2820000005');

    // update collection data
    unmarshal(
      {
        createRule: 'book.user = @request.auth.id',
        updateRule: 'book.user = @request.auth.id',
      },
      collection
    );

    return app.save(collection);
  }
);
