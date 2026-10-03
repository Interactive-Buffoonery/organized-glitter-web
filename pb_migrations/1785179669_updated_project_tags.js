/// <reference path="../pb_data/types.d.ts" />
migrate(
  app => {
    const collection = app.findCollectionByNameOrId('pbc_28645432');

    // update collection data
    unmarshal(
      {
        updateRule: 'project.user = @request.auth.id && tag.user = @request.auth.id',
      },
      collection
    );

    return app.save(collection);
  },
  app => {
    const collection = app.findCollectionByNameOrId('pbc_28645432');

    // update collection data
    unmarshal(
      {
        updateRule: 'project.user = @request.auth.id',
      },
      collection
    );

    return app.save(collection);
  }
);
