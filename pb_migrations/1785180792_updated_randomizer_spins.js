/// <reference path="../pb_data/types.d.ts" />
migrate(
  app => {
    const collection = app.findCollectionByNameOrId('pbc_4013924363');

    // update collection data
    unmarshal(
      {
        createRule: 'user = @request.auth.id && (project = "" || project.user = @request.auth.id)',
        updateRule: 'user = @request.auth.id && (project = "" || project.user = @request.auth.id)',
      },
      collection
    );

    return app.save(collection);
  },
  app => {
    const collection = app.findCollectionByNameOrId('pbc_4013924363');

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
