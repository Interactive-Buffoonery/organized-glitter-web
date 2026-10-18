/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  'POST',
  '/api/archive/restore-coloring-page-metadata',
  e => {
    if (!e.auth.getBool('verified')) {
      throw new ForbiddenError('Email verification is required.');
    }

    const body = new DynamicModel({
      pageId: '',
      baseline: {},
      intended: {},
    });
    e.bindBody(body);

    const isStringArray = function (value) {
      const items = Array.from(value || []);
      for (let i = 0; i < items.length; i += 1) {
        if (typeof items[i] !== 'string') return false;
      }
      return true;
    };
    const readMetadataSnapshot = function (value) {
      if (!value || typeof value.get !== 'function') return null;
      return {
        status: value.get('status'),
        mediumIds: Array.from(value.get('mediumIds') || []),
        revealedSubject: value.get('revealedSubject'),
        revealedAt: value.get('revealedAt'),
        startedAt: value.get('startedAt'),
        completedAt: value.get('completedAt'),
        updatedAt: value.get('updatedAt'),
      };
    };
    const isMetadataSnapshot = function (value, requiresUpdatedAt) {
      return (
        value !== null &&
        typeof value === 'object' &&
        typeof value.status === 'string' &&
        isStringArray(value.mediumIds) &&
        typeof value.revealedSubject === 'string' &&
        typeof value.revealedAt === 'string' &&
        typeof value.startedAt === 'string' &&
        typeof value.completedAt === 'string' &&
        (!requiresUpdatedAt || typeof value.updatedAt === 'string')
      );
    };
    const baseline = readMetadataSnapshot(body.baseline);
    const intended = readMetadataSnapshot(body.intended);

    if (
      typeof body.pageId !== 'string' ||
      body.pageId === '' ||
      !isMetadataSnapshot(baseline, true) ||
      !isMetadataSnapshot(intended, false)
    ) {
      throw new BadRequestError('Invalid archive page restore request.');
    }
    const uniqueMediumIds = [];
    const seenMediumIds = {};
    for (let i = 0; i < intended.mediumIds.length; i += 1) {
      const mediumId = intended.mediumIds[i];
      if (seenMediumIds[mediumId]) continue;
      seenMediumIds[mediumId] = true;
      uniqueMediumIds.push(mediumId);
    }
    intended.mediumIds = uniqueMediumIds;

    const authId = e.auth.getString('id');
    const archiveContext = new Context(
      e.request.context(),
      'organized_glitter_archive_restore',
      true
    );
    let outcome = '';

    e.app.runInTransaction(txApp => {
      const normalizeIds = function (ids) {
        const values = Array.from(ids || []);
        values.sort();
        return values;
      };
      const normalizeDateOnly = function (value) {
        if (typeof value !== 'string' || value === '') return '';
        return value.slice(0, 10);
      };
      const snapshotRecord = function (record) {
        return {
          status: record.getString('status'),
          mediumIds: normalizeIds(record.getStringSlice('mediums')),
          revealedSubject: record.getString('revealed_subject'),
          revealedAt: record.getString('revealed_at'),
          startedAt: normalizeDateOnly(record.getString('started_at')),
          completedAt: normalizeDateOnly(record.getString('completed_at')),
          updatedAt: record.getDateTime('updated').string(),
        };
      };
      const metadataMatches = function (current, expected) {
        return (
          current.status === expected.status &&
          normalizeIds(current.mediumIds).join('\0') ===
            normalizeIds(expected.mediumIds).join('\0') &&
          current.revealedSubject === expected.revealedSubject &&
          current.revealedAt === expected.revealedAt &&
          current.startedAt === expected.startedAt &&
          current.completedAt === expected.completedAt
        );
      };

      const page = txApp.findRecordById('coloring_pages', body.pageId);
      const book = txApp.findRecordById('coloring_books', page.getString('book'));
      if (book.getString('user') !== authId) {
        throw new ForbiddenError('This coloring page is not owned by the current user.');
      }

      for (let i = 0; i < intended.mediumIds.length; i += 1) {
        const medium = txApp.findRecordById('coloring_mediums', intended.mediumIds[i]);
        if (medium.getString('user') !== authId) {
          throw new BadRequestError('Invalid coloring medium.', {
            mediumIds: 'Every medium must be owned by the current user.',
          });
        }
      }

      const current = snapshotRecord(page);
      if (metadataMatches(current, intended)) {
        outcome = 'already_applied';
        return;
      }

      if (current.updatedAt !== baseline.updatedAt || !metadataMatches(current, baseline)) {
        outcome = 'conflict';
        return;
      }

      page.set('status', intended.status);
      page.set('mediums', intended.mediumIds);
      page.set('revealed_subject', intended.revealedSubject);
      page.set('revealed_at', intended.revealedAt);
      page.set('started_at', intended.startedAt);
      page.set('completed_at', intended.completedAt);
      txApp.saveWithContext(archiveContext, page);
      const savedPage = txApp.findRecordById('coloring_pages', body.pageId);
      if (!metadataMatches(snapshotRecord(savedPage), intended)) {
        throw new Error('Archive page metadata did not persist exactly.');
      }
      outcome = 'updated';
    });

    if (outcome === 'conflict') {
      throw new ApiError(409, 'Coloring page metadata changed after archive restore started.', {
        reason: 'archive_restore_conflict',
      });
    }

    return e.json(200, { outcome });
  },
  $apis.requireAuth('users')
);

routerAdd(
  'POST',
  '/api/archive/restore-diamond-project',
  e => {
    if (!e.auth.getBool('verified')) {
      throw new ForbiddenError('Email verification is required.');
    }

    // DynamicModel needs -0 to bind decimal form values as floats.
    const floatZero = -0;
    const body = new DynamicModel({
      id: '',
      title: '',
      status: '',
      kitCategory: 'full',
      drillShape: '',
      width: floatZero,
      height: floatZero,
      totalDiamonds: 0,
      colorCount: 0,
      datePurchased: '',
      dateReceived: '',
      dateStarted: '',
      dateCompleted: '',
      generalNotes: '',
      sourceUrl: '',
      company: '',
      artist: '',
    });
    e.bindBody(body);

    const validStatuses = [
      'wishlist',
      'purchased',
      'stash',
      'kitted',
      'progress',
      'onhold',
      'completed',
      'archived',
      'destashed',
    ];
    const isValidDimension = value => Number.isFinite(value) && value >= 0;
    if (
      (body.id && !/^[a-z0-9]{15}$/.test(body.id)) ||
      typeof body.title !== 'string' ||
      body.title.trim() === '' ||
      !validStatuses.includes(body.status) ||
      !['full', 'mini'].includes(body.kitCategory) ||
      !isValidDimension(body.width) ||
      !isValidDimension(body.height) ||
      !Number.isSafeInteger(body.colorCount) ||
      body.colorCount < 0
    ) {
      throw new BadRequestError('Invalid archive diamond project restore request.');
    }

    const authId = e.auth.getString('id');
    const archiveContext = new Context(
      e.request.context(),
      'organized_glitter_archive_restore',
      true
    );
    let imageFiles = [];
    try {
      imageFiles = e.findUploadedFiles('image');
    } catch (_error) {
      imageFiles = [];
    }
    if (imageFiles.length > 1) {
      throw new BadRequestError('Archive diamond project has too many cover images.');
    }

    let restoredId = '';
    let restoredStatus = '';
    e.app.runInTransaction(txApp => {
      const assertOwnedRelation = function (collectionName, recordId) {
        if (!recordId) return;
        const related = txApp.findRecordById(collectionName, recordId);
        if (related.getString('user') !== authId) {
          throw new BadRequestError('Invalid archive diamond project relation.');
        }
      };
      assertOwnedRelation('companies', body.company);
      assertOwnedRelation('artists', body.artist);

      const project = new Record(txApp.findCollectionByNameOrId('projects'));
      if (body.id) project.set('id', body.id);
      project.set('user', authId);
      project.set('title', body.title);
      project.set('status', body.status);
      project.set('kit_category', body.kitCategory);
      project.set('drill_shape', body.drillShape);
      if (body.width) project.set('width', body.width);
      if (body.height) project.set('height', body.height);
      if (body.totalDiamonds) project.set('total_diamonds', body.totalDiamonds);
      project.set('color_count', body.colorCount);
      project.set('date_purchased', body.datePurchased);
      project.set('date_received', body.dateReceived);
      project.set('date_started', body.dateStarted);
      project.set('date_completed', body.dateCompleted);
      project.set('general_notes', body.generalNotes);
      project.set('source_url', body.sourceUrl);
      project.set('company', body.company);
      project.set('artist', body.artist);
      if (imageFiles.length) project.set('image', imageFiles);
      txApp.saveWithContext(archiveContext, project);
      restoredId = project.id;
      restoredStatus = project.getString('status');
    });

    return e.json(200, { id: restoredId, status: restoredStatus });
  },
  $apis.requireAuth('users')
);

routerAdd(
  'POST',
  '/api/archive/restore-coloring-book',
  e => {
    if (!e.auth.getBool('verified')) {
      throw new ForbiddenError('Email verification is required.');
    }

    const body = new DynamicModel({
      archiveFingerprint: '',
      archiveBookRef: '',
      title: '',
      publisher: '',
      illustrator: '',
      series: '',
      theme: '',
      isbn: '',
      publicationYear: 0,
      edition: '',
      language: '',
      sourceUrl: '',
      datePurchased: '',
      dateReceived: '',
      dateStarted: '',
      dateCompleted: '',
      bookFormat: '',
      notes: '',
      isMystery: false,
      status: '',
      totalPages: 0,
      completedPages: 0,
      completionPercentage: 0,
      lastActivityAt: '',
      firstPage: 0,
      pageCount: 0,
      allowCreate: false,
    });
    e.bindBody(body);

    if (
      !/^[a-f0-9]{64}$/.test(body.archiveFingerprint) ||
      !body.archiveBookRef.startsWith('coloring-book:') ||
      typeof body.title !== 'string' ||
      body.title.trim() === '' ||
      !Number.isSafeInteger(body.totalPages) ||
      body.totalPages < 1 ||
      !Number.isSafeInteger(body.firstPage) ||
      body.firstPage < 1 ||
      !Number.isSafeInteger(body.pageCount) ||
      body.pageCount < 1 ||
      body.pageCount > 100 ||
      body.firstPage + body.pageCount - 1 > body.totalPages ||
      typeof body.allowCreate !== 'boolean'
    ) {
      throw new BadRequestError('Invalid archive coloring book restore request.');
    }
    const pageNumbers = [];
    for (let i = 0; i < body.pageCount; i += 1) {
      pageNumbers.push(body.firstPage + i);
    }

    const authId = e.auth.getString('id');
    const bookId = $security
      .sha256(`${authId}\0${body.archiveFingerprint}\0${body.archiveBookRef}`)
      .slice(0, 15);
    const archiveContext = new Context(
      e.request.context(),
      'organized_glitter_archive_restore',
      true
    );
    let coverFiles = [];
    try {
      coverFiles = e.findUploadedFiles('cover_image');
    } catch (_error) {
      coverFiles = [];
    }
    let created = false;
    let restoredPages = [];

    e.app.runInTransaction(txApp => {
      const assertOwnedRelation = function (collectionName, recordId) {
        if (!recordId) return;
        const related = txApp.findRecordById(collectionName, recordId);
        if (related.getString('user') !== authId) {
          throw new BadRequestError('Invalid archive coloring book relation.');
        }
      };
      assertOwnedRelation('book_publishers', body.publisher);
      assertOwnedRelation('book_illustrators', body.illustrator);

      let book = null;
      try {
        book = txApp.findRecordById('coloring_books', bookId);
      } catch (_error) {
        book = null;
      }

      if (book) {
        if (
          book.getString('user') !== authId ||
          book.getString('title') !== body.title ||
          book.getInt('total_pages') !== body.totalPages
        ) {
          throw new ApiError(
            409,
            'Archive coloring book identity conflicts with an existing record.'
          );
        }
      } else if (!body.allowCreate) {
        throw new ApiError(409, 'Archive recovery target no longer exists.', {
          reason: 'archive_recovery_target_missing',
        });
      } else {
        const booksCollection = txApp.findCollectionByNameOrId('coloring_books');
        book = new Record(booksCollection);
        book.set('id', bookId);
        book.set('user', authId);
        book.set('title', body.title);
        book.set('publisher', body.publisher);
        book.set('illustrator', body.illustrator);
        book.set('series', body.series);
        book.set('theme', body.theme);
        book.set('isbn', body.isbn);
        book.set('publication_year', body.publicationYear);
        book.set('edition', body.edition);
        book.set('language', body.language);
        book.set('source_url', body.sourceUrl);
        book.set('date_purchased', body.datePurchased);
        book.set('date_received', body.dateReceived);
        book.set('date_started', body.dateStarted);
        book.set('date_completed', body.dateCompleted);
        book.set('book_format', body.bookFormat);
        book.set('notes', body.notes);
        book.set('is_mystery', body.isMystery);
        book.set('status', body.status);
        book.set('total_pages', body.totalPages);
        book.set('completed_pages', body.completedPages);
        book.set('completion_percentage', body.completionPercentage);
        book.set('last_activity_at', body.lastActivityAt);
        if (coverFiles.length > 0) {
          book.set('cover_image', coverFiles);
        }
        txApp.saveWithContext(archiveContext, book);
        created = true;
      }

      const existingPages = txApp.findRecordsByFilter(
        'coloring_pages',
        'book = {:bookId} && page_number >= {:firstPage} && page_number <= {:lastPage}',
        'page_number',
        100,
        0,
        {
          bookId,
          firstPage: pageNumbers[0],
          lastPage: pageNumbers[pageNumbers.length - 1],
        }
      );
      const pagesByNumber = {};
      for (let i = 0; i < existingPages.length; i += 1) {
        pagesByNumber[existingPages[i].getInt('page_number')] = existingPages[i];
      }

      const pagesCollection = txApp.findCollectionByNameOrId('coloring_pages');
      for (let i = 0; i < pageNumbers.length; i += 1) {
        const pageNumber = pageNumbers[i];
        if (!pagesByNumber[pageNumber]) {
          const page = new Record(pagesCollection);
          page.set('book', bookId);
          page.set('page_number', pageNumber);
          page.set('status', 'not_started');
          txApp.saveWithContext(archiveContext, page);
          pagesByNumber[pageNumber] = page;
        }
      }

      restoredPages = pageNumbers.map(pageNumber => {
        const page = pagesByNumber[pageNumber];
        return {
          id: page.id,
          bookId,
          pageNumber,
          status: page.getString('status'),
          photos: page.getStringSlice('photos'),
          mediumIds: page.getStringSlice('mediums'),
          revealedSubject: page.getString('revealed_subject'),
          revealedAt: page.getString('revealed_at'),
          startedAt: page.getString('started_at').slice(0, 10),
          completedAt: page.getString('completed_at').slice(0, 10),
          createdAt: page.getDateTime('created').string(),
          updatedAt: page.getDateTime('updated').string(),
        };
      });
    });

    return e.json(200, {
      bookId,
      created,
      pages: restoredPages,
    });
  },
  $apis.requireAuth('users')
);

routerAdd(
  'POST',
  '/api/archive/reconcile-coloring-book-metrics',
  e => {
    if (!e.auth.getBool('verified')) {
      throw new ForbiddenError('Email verification is required.');
    }

    const body = new DynamicModel({ bookId: '' });
    e.bindBody(body);
    if (typeof body.bookId !== 'string' || body.bookId === '') {
      throw new BadRequestError('Invalid archive coloring book metrics request.');
    }

    const authId = e.auth.getString('id');
    const archiveContext = new Context(
      e.request.context(),
      'organized_glitter_archive_restore',
      true
    );
    let completedPages = 0;
    let completionPercentage = 0;

    e.app.runInTransaction(txApp => {
      const book = txApp.findRecordById('coloring_books', body.bookId);
      if (book.getString('user') !== authId) {
        throw new ForbiddenError('This coloring book is not owned by the current user.');
      }

      const metrics = new DynamicModel({ completedPages: 0 });
      txApp
        .db()
        .newQuery(
          `
          SELECT COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completedPages
          FROM coloring_pages
          WHERE book = {:bookId} AND page_number <= {:totalPages}
        `
        )
        .bind({ bookId: body.bookId, totalPages: book.getInt('total_pages') })
        .one(metrics);

      completedPages = Number(metrics.completedPages) || 0;
      const totalPages = book.getInt('total_pages');
      completionPercentage =
        totalPages <= 0
          ? 0
          : Math.round(Math.min(100, Math.max(0, (completedPages / totalPages) * 100)));
      book.set('completed_pages', completedPages);
      book.set('completion_percentage', completionPercentage);
      txApp.saveWithContext(archiveContext, book);

      const savedBook = txApp.findRecordById('coloring_books', body.bookId);
      if (
        savedBook.getInt('completed_pages') !== completedPages ||
        savedBook.getInt('completion_percentage') !== completionPercentage
      ) {
        throw new Error('Archive coloring book metrics did not persist exactly.');
      }
    });

    return e.json(200, { completedPages, completionPercentage });
  },
  $apis.requireAuth('users')
);

routerAdd(
  'POST',
  '/api/archive/restore-color-keys',
  e => {
    if (!e.auth.getBool('verified')) throw new ForbiddenError('Email verification is required.');
    const body = e.requestInfo().body;
    if (
      typeof body.archiveFingerprint !== 'string' ||
      !body.archiveFingerprint ||
      body.archiveFingerprint.length > 255 ||
      typeof body.pageId !== 'string' ||
      typeof body.pageRef !== 'string' ||
      !/^coloring-page:[a-z0-9][a-z0-9:._-]*$/.test(body.pageRef) ||
      body.pageRef.length > 220 ||
      !Array.isArray(body.keys) ||
      !body.keys.length ||
      body.keys.length > 500
    ) {
      throw new BadRequestError('Invalid archive color keys request.');
    }
    const refs = new Set();
    for (const key of body.keys) {
      if (
        !key ||
        typeof key !== 'object' ||
        Array.isArray(key) ||
        typeof key.ref !== 'string' ||
        key.ref.length > 255 ||
        !/^coloring-color-key:[a-z0-9][a-z0-9:._-]*$/.test(key.ref) ||
        refs.has(key.ref)
      )
        throw new BadRequestError('Invalid or duplicate archive color key.');
      refs.add(key.ref);
    }
    const authId = e.auth.id;
    const backupId = $security.sha256('legacy-color-keys:' + body.archiveFingerprint);
    const itemId = 'coloring-color-key:page:' + body.pageRef;
    const digest = $security.sha256(
      JSON.stringify({
        pageId: body.pageId,
        keys: body.keys.map(key =>
          Object.keys(key)
            .sort()
            .map(field => [field, key[field]])
        ),
      })
    );
    const conflict = () =>
      new ApiError(
        409,
        'These color keys conflict with an earlier restore. Export again to restore them.'
      );
    const keyId = ref => $security.sha256(authId + '\0' + backupId + '\0' + ref).slice(0, 15);
    const context = new Context(e.request.context(), 'organized_glitter_archive_restore', true);
    let result;
    e.app.runInTransaction(app => {
      const page = app.findRecordById('coloring_pages', body.pageId);
      const book = app.findRecordById('coloring_books', page.getString('book'));
      if (book.getString('user') !== authId) throw new ForbiddenError();
      const receipts = app.findRecordsByFilter(
        'archive_restore_items',
        'user = {:user} && backup_id = {:backup} && item_id = {:item}',
        '',
        1,
        0,
        { user: authId, backup: backupId, item: itemId }
      );
      if (receipts.length && receipts[0].getString('item_digest') !== digest) throw conflict();
      if (receipts.length) {
        const existing = app.findRecordsByIds(
          'coloring_page_color_keys',
          body.keys.map(key => keyId(key.ref))
        );
        const ownedIds = new Set(
          existing
            .filter(row => row.getString('user') === authId && row.getString('page') === page.id)
            .map(row => row.id)
        );
        result = {
          outcome: 'already_applied',
          refMap: Object.fromEntries(
            body.keys
              .filter(key => ownedIds.has(keyId(key.ref)))
              .map(key => [key.ref, keyId(key.ref)])
          ),
        };
        return;
      }
      const existing = app.findRecordsByFilter(
        'coloring_page_color_keys',
        'page = {:page}',
        '',
        1,
        0,
        { page: page.id }
      );
      if (existing.length) {
        result = { outcome: 'skipped', refMap: {} };
        return;
      }
      const refMap = {};
      const collection = app.findCollectionByNameOrId('coloring_page_color_keys');
      for (const key of body.keys) {
        const metadata = { ...key };
        delete metadata.ref;
        const record = new Record(collection);
        record.set('id', keyId(key.ref));
        record.set('user', authId);
        record.set('page', page.id);
        require(`${__hooks}/archive_color_keys.js`).saveKey(app, record, metadata, context);
        refMap[key.ref] = record.id;
      }
      const receipt = new Record(app.findCollectionByNameOrId('archive_restore_items'));
      receipt.set('user', authId);
      receipt.set('backup_id', backupId);
      receipt.set('item_id', itemId);
      receipt.set('item_kind', 'coloring-color-key');
      receipt.set('item_digest', digest);
      receipt.set('state', 'complete');
      receipt.set('target_collection', 'coloring_pages');
      receipt.set('target_record_id', page.id);
      app.save(receipt);
      result = { outcome: 'created', refMap };
    });
    return e.json(200, result);
  },
  $apis.requireAuth('users')
);
