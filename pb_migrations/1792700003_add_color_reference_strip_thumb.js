/// <reference path="../pb_data/types.d.ts" />
// A preview 240px tall for the strip pinned above the color list, which shows at most 112px tall.
migrate(
  app => {
    const collection = app.findCollectionByNameOrId('coloring_page_color_references');
    const field = collection.fields.getByName('photos');
    field.thumbs = ['320x320f', '0x240'];
    return app.save(collection);
  },
  app => {
    const collection = app.findCollectionByNameOrId('coloring_page_color_references');
    const field = collection.fields.getByName('photos');
    field.thumbs = ['320x320f'];
    return app.save(collection);
  }
);
