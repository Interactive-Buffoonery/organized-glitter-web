/// <reference path="../pb_data/types.d.ts" />

onRecordUpdateRequest(
  e => {
    if (e.hasSuperuserAuth()) {
      e.next();
      return;
    }

    const authId = e.auth ? e.auth.getString('id') : '';
    if (authId === '') {
      throw new ForbiddenError('Authentication is required.');
    }
    const collectionName = e.collection.name;
    const directOwnerCollections = {
      artists: true,
      book_illustrators: true,
      book_publishers: true,
      coloring_books: true,
      coloring_mediums: true,
      // PocketBase 0.37.5 stores this legacy maxSelect:0 export as one scalar ID.
      coloring_page_progress_notes: true,
      coloring_tags: true,
      companies: true,
      projects: true,
      randomizer_spins: true,
      tags: true,
      user_dashboard_settings: true,
      user_yearly_stats: true,
    };
    const relationsByCollection = {
      projects: [
        ['company', 'companies'],
        ['artist', 'artists'],
      ],
      progress_notes: [['project', 'projects']],
      project_tags: [
        ['project', 'projects'],
        ['tag', 'tags'],
      ],
      coloring_books: [
        ['publisher', 'book_publishers'],
        ['illustrator', 'book_illustrators'],
      ],
      coloring_pages: [['book', 'coloring_books']],
      coloring_page_progress_notes: [['page', 'coloring_pages']],
      coloring_book_tags: [
        ['book', 'coloring_books'],
        ['tag', 'coloring_tags'],
      ],
      randomizer_spins: [['project', 'projects']],
    };

    if (
      directOwnerCollections[collectionName] === true &&
      e.record.getString('user') !== e.record.original().getString('user')
    ) {
      throw new BadRequestError('Invalid owner.', {
        user: 'Record ownership cannot be changed.',
      });
    }

    const relations = relationsByCollection[collectionName] || [];
    for (let i = 0; i < relations.length; i += 1) {
      const field = relations[i][0];
      const relatedCollection = relations[i][1];
      const nextId = e.record.getString(field);
      const previousId = e.record.original().getString(field);
      if (nextId === '' || nextId === previousId) {
        continue;
      }

      let relatedOwner = '';
      try {
        const related = e.app.findRecordById(relatedCollection, nextId);
        relatedOwner = related.getString('user');
        if (relatedCollection === 'coloring_pages') {
          const book = e.app.findRecordById('coloring_books', related.getString('book'));
          relatedOwner = book.getString('user');
        }
      } catch (_err) {
        $app.logger().error('relation_ownership: relation lookup failed', {
          collection: relatedCollection,
          error: String(_err),
          field,
          reason: 'related_record_lookup_failed',
        });
        const details = {};
        details[field] = 'The referenced record does not exist.';
        throw new BadRequestError('Invalid relation.', details);
      }

      if (relatedOwner !== authId) {
        const details = {};
        details[field] = 'The referenced record is not owned by the current user.';
        throw new BadRequestError('Invalid relation.', details);
      }
    }

    e.next();
  },
  'artists',
  'book_illustrators',
  'book_publishers',
  'coloring_book_tags',
  'coloring_books',
  'coloring_mediums',
  'coloring_page_progress_notes',
  'coloring_pages',
  'coloring_tags',
  'companies',
  'progress_notes',
  'project_tags',
  'projects',
  'randomizer_spins',
  'tags',
  'user_dashboard_settings',
  'user_yearly_stats'
);
