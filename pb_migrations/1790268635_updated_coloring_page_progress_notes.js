/// <reference path="../pb_data/types.d.ts" />
migrate(
  app => {
    const collection = app.findCollectionByNameOrId('pbc_4218181872');

    // update field
    collection.fields.addAt(
      1,
      new Field({
        help: '',
        hidden: false,
        id: 'file3309110367',
        maxSelect: 0,
        maxSize: 10485760,
        mimeTypes: [
          'image/png',
          'image/jpeg',
          'image/gif',
          'image/webp',
          'image/heic',
          'image/heif',
        ],
        name: 'image',
        presentable: false,
        protected: true,
        required: false,
        system: false,
        thumbs: [],
        type: 'file',
      })
    );

    return app.save(collection);
  },
  () => {
    throw new Error(
      'Refusing to unprotect private files during rollback; use a reviewed forward migration'
    );
  }
);
