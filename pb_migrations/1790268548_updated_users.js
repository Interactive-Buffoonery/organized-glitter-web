/// <reference path="../pb_data/types.d.ts" />
migrate(
  app => {
    const collection = app.findCollectionByNameOrId('_pb_users_auth_');

    // update field
    collection.fields.addAt(
      7,
      new Field({
        help: '',
        hidden: false,
        id: 'file376926767',
        maxSelect: 1,
        maxSize: 0,
        mimeTypes: [
          'image/jpeg',
          'image/png',
          'image/svg+xml',
          'image/gif',
          'image/webp',
          'image/heic',
          'image/heif',
        ],
        name: 'avatar',
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
