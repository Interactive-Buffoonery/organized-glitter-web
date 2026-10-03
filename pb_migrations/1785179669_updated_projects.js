/// <reference path="../pb_data/types.d.ts" />
migrate(
  app => {
    const collection = app.findCollectionByNameOrId('pbc_484305853');

    // update collection data
    unmarshal(
      {
        createRule:
          '@request.auth.id != "" && user = @request.auth.id && (company = "" || company.user = @request.auth.id) && (artist = "" || artist.user = @request.auth.id)',
        updateRule:
          'user = @request.auth.id && (company = "" || company.user = @request.auth.id) && (artist = "" || artist.user = @request.auth.id)',
      },
      collection
    );

    return app.save(collection);
  },
  app => {
    const collection = app.findCollectionByNameOrId('pbc_484305853');

    // update collection data
    unmarshal(
      {
        createRule: '@request.auth.id != "" && user = @request.auth.id',
        updateRule: 'user = @request.auth.id',
      },
      collection
    );

    return app.save(collection);
  }
);
