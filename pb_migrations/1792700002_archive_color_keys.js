migrate(
  app => {
    const collection = app.findCollectionByNameOrId('archive_restore_items');
    const field = collection.fields.getByName('item_kind');
    field.values = [...field.values, 'coloring-color-key'];
    return app.save(collection);
  },
  app => {
    if (
      app.findRecordsByFilter('archive_restore_items', 'item_kind = "coloring-color-key"', '', 1, 0)
        .length
    )
      throw new Error('Refusing rollback while color key archive receipts exist.');
    const collection = app.findCollectionByNameOrId('archive_restore_items');
    const field = collection.fields.getByName('item_kind');
    field.values = field.values.filter(value => value !== 'coloring-color-key');
    return app.save(collection);
  }
);
