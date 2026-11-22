/// <reference path="../pb_data/types.d.ts" />

migrate(
  app => {
    const collection = app.findCollectionByNameOrId('coloring_pages');
    collection.fields.add(
      new Field({
        help: '',
        hidden: true,
        id: 'bool_mobile_completion_date_generated',
        name: 'mobile_completion_date_generated',
        presentable: false,
        required: false,
        system: false,
        type: 'bool',
      })
    );
    return app.save(collection);
  },
  app => {
    const markedPages = app.findRecordsByFilter(
      'coloring_pages',
      'mobile_completion_date_generated = true',
      '',
      1,
      0
    );
    if (markedPages.length) {
      throw new Error('Refusing rollback while generated mobile completion markers exist.');
    }
    const collection = app.findCollectionByNameOrId('coloring_pages');
    collection.fields.removeByName('mobile_completion_date_generated');
    return app.save(collection);
  }
);
