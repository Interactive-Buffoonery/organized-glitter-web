/// <reference path="../pb_data/types.d.ts" />
migrate(
  app => {
    const collection = app.findCollectionByNameOrId('pbc_4211420130');

    // add field
    collection.fields.addAt(
      7,
      new Field({
        autogeneratePattern: '',
        help: '',
        hidden: true,
        id: 'text2538270756',
        max: 200,
        min: 0,
        name: 'restore_key',
        pattern: '',
        presentable: false,
        primaryKey: false,
        required: false,
        system: false,
        type: 'text',
      })
    );

    // add field
    collection.fields.addAt(
      8,
      new Field({
        help: '',
        hidden: true,
        id: 'json1520180167',
        maxSize: 20000,
        name: 'upload_receipts',
        presentable: false,
        required: false,
        system: false,
        type: 'json',
      })
    );

    return app.save(collection);
  },
  () => {
    throw new Error('Refusing destructive rollback: color references contain saved user work.');
  }
);
