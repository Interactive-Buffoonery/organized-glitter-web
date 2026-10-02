/// <reference path="../pb_data/types.d.ts" />

onRecordCreate(
  e => {
    e.record.set('revision', 0);
    e.next();
  },
  'projects',
  'coloring_books'
);

onRecordUpdate(
  e => {
    const originalApp = e.app;
    originalApp.runInTransaction(txApp => {
      e.app = txApp;
      try {
        const current = txApp.findRecordById(e.record.collection().name, e.record.id);
        const revision = current.getInt('revision');
        if (
          !Number.isSafeInteger(revision) ||
          revision < 0 ||
          revision >= Number.MAX_SAFE_INTEGER
        ) {
          throw new ApiError(409, 'This record has an invalid revision.');
        }

        e.record.set('revision', revision + 1);
        e.next();
      } finally {
        e.app = originalApp;
      }
    });
  },
  'projects',
  'coloring_books'
);

onRecordUpdateRequest(e => {
  require(`${__hooks}/tag_revision_helpers.js`).guardedUpdate(e, {
    collection: 'projects',
    conflictMessage: 'This project changed elsewhere.',
  });
}, 'projects');

onRecordCreate(e => {
  require(`${__hooks}/tag_revision_helpers.js`).reviseTagParent(
    e,
    { parent: 'projects', parentField: 'project', tags: 'tags' },
    'create'
  );
}, 'project_tags');
onRecordUpdate(e => {
  require(`${__hooks}/tag_revision_helpers.js`).reviseTagParent(
    e,
    { parent: 'projects', parentField: 'project', tags: 'tags' },
    'update'
  );
}, 'project_tags');
onRecordDelete(e => {
  require(`${__hooks}/tag_revision_helpers.js`).reviseTagParent(
    e,
    { parent: 'projects', parentField: 'project', tags: 'tags' },
    'delete'
  );
}, 'project_tags');
onRecordCreate(e => {
  require(`${__hooks}/tag_revision_helpers.js`).reviseTagParent(
    e,
    { parent: 'coloring_books', parentField: 'book', tags: 'coloring_tags' },
    'create'
  );
}, 'coloring_book_tags');
onRecordUpdate(e => {
  require(`${__hooks}/tag_revision_helpers.js`).reviseTagParent(
    e,
    { parent: 'coloring_books', parentField: 'book', tags: 'coloring_tags' },
    'update'
  );
}, 'coloring_book_tags');
onRecordDelete(e => {
  require(`${__hooks}/tag_revision_helpers.js`).reviseTagParent(
    e,
    { parent: 'coloring_books', parentField: 'book', tags: 'coloring_tags' },
    'delete'
  );
}, 'coloring_book_tags');
