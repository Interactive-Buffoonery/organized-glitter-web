/// <reference path="../pb_data/types.d.ts" />

onRecordDeleteRequest(
  e => {
    if (e.hasSuperuserAuth()) {
      e.next();
      return;
    }

    const referencesByCollection = {
      companies: [['projects', 'company', '=']],
      artists: [['projects', 'artist', '=']],
      tags: [['project_tags', 'tag', '=']],
      book_publishers: [['coloring_books', 'publisher', '=']],
      book_illustrators: [['coloring_books', 'illustrator', '=']],
      coloring_mediums: [['coloring_pages', 'mediums.id', '?=']],
      coloring_tags: [['coloring_book_tags', 'tag', '=']],
    };
    const references = referencesByCollection[e.collection.name] || [];
    const recordId = e.record.getString('id');

    for (let i = 0; i < references.length; i += 1) {
      const reference = references[i];
      // Any remaining reference, including inconsistent legacy data, blocks deletion.
      const matches = e.app.findRecordsByFilter(
        reference[0],
        `${reference[1]} ${reference[2]} {:recordId}`,
        '',
        1,
        0,
        { recordId }
      );

      if (matches.length > 0) {
        throw new BadRequestError('This list item is still in use.', {
          id: 'Remove it from existing records before deleting it.',
        });
      }
    }

    e.next();
  },
  'artists',
  'book_illustrators',
  'book_publishers',
  'coloring_mediums',
  'coloring_tags',
  'companies',
  'tags'
);
