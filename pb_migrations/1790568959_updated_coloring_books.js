/// <reference path="../pb_data/types.d.ts" />
migrate(
  app => {
    const collection = app.findCollectionByNameOrId('pbc_2820000003');

    // add field
    collection.fields.addAt(
      27,
      new Field({
        help: '',
        hidden: false,
        id: 'number1835210188',
        max: null,
        min: 0,
        name: 'revision',
        onlyInt: true,
        presentable: false,
        required: false,
        system: false,
        type: 'number',
      })
    );

    return app.save(collection);
  },
  () => {
    throw new Error('Coloring book revisions cannot be rolled back after writes.');
  }
);
