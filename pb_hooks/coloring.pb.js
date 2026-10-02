/// <reference path="../pb_data/types.d.ts" />

onRecordUpdateRequest(e => {
  require(`${__hooks}/tag_revision_helpers.js`).guardedUpdate(e, {
    collection: 'coloring_books',
    conflictMessage: 'This coloring book changed elsewhere.',
    // Header-free updates also need atomic page cleanup.
    alwaysTransaction: true,
  });
}, 'coloring_books');

routerAdd(
  'POST',
  '/api/coloring/books/{bookId}/reduce-pages',
  e => {
    if (!e.auth.getBool('verified')) {
      throw new ForbiddenError('Email verification is required.');
    }

    const maximumDeletedPages = 500;
    const body = new DynamicModel({ targetTotalPages: 0 });
    e.bindBody(body);

    if (!Number.isSafeInteger(body.targetTotalPages) || body.targetTotalPages < 1) {
      throw new BadRequestError('Invalid coloring book page reduction request.', {
        targetTotalPages: new ValidationError(
          'validation_page_count',
          'Target total pages must be a positive whole number.'
        ),
      });
    }

    const bookId = e.request.pathValue('bookId');
    const authId = e.auth.getString('id');
    const reductionContext = new Context(
      e.request.context(),
      'organized_glitter_page_reduction',
      true
    );
    const cleanupContext = new Context(
      reductionContext,
      'organized_glitter_page_reduction_cleanup',
      true
    );
    let response = null;

    e.app.runInTransaction(txApp => {
      const book = txApp.findRecordById('coloring_books', bookId);
      if (book.getString('user') !== authId) {
        throw new ForbiddenError('This coloring book is not owned by the current user.');
      }

      const currentTotalPages = book.getInt('total_pages');
      if (body.targetTotalPages > currentTotalPages) {
        throw new BadRequestError('Invalid coloring book page reduction request.', {
          targetTotalPages: new ValidationError(
            'validation_page_reduction',
            'The reduction target cannot exceed the current total pages.'
          ),
        });
      }

      const summary = new DynamicModel({
        extraPages: 0,
        highestWorkedPage: 0,
        hiddenPages: 0,
        workedPages: 0,
      });
      txApp
        .db()
        .newQuery(
          `
          WITH extra_pages AS (
            SELECT
              cp.page_number,
              CASE WHEN
                cp.status != 'not_started'
                OR COALESCE(cp.started_at, '') != ''
                OR COALESCE(cp.completed_at, '') != ''
                OR COALESCE(cp.revealed_subject, '') != ''
                OR COALESCE(cp.revealed_at, '') != ''
                OR COALESCE(cp.mediums, '') NOT IN ('', '[]', 'null')
                OR COALESCE(cp.photos, '') NOT IN ('', '[]', 'null')
                OR EXISTS (
                  SELECT 1 FROM coloring_page_color_references cr
                  WHERE cr.page = cp.id
                    AND (trim(cr.notes, char(9) || char(10) || char(13) || ' ') != ''
                      OR COALESCE(cr.photos, '') NOT IN ('', '[]', 'null'))
                )
                OR EXISTS (
                  SELECT 1
                  FROM coloring_page_progress_notes cpn
                  WHERE cpn.page = cp.id
                )
              THEN 1 ELSE 0 END AS is_worked
            FROM coloring_pages cp
            WHERE cp.book = {:bookId}
              AND cp.page_number > {:targetTotalPages}
          )
          SELECT
            COUNT(*) AS extraPages,
            COALESCE(MAX(CASE WHEN is_worked = 1 THEN page_number ELSE 0 END), 0) AS highestWorkedPage,
            COALESCE(SUM(CASE WHEN page_number > {:currentTotalPages} THEN 1 ELSE 0 END), 0) AS hiddenPages,
            COALESCE(SUM(is_worked), 0) AS workedPages
          FROM extra_pages
        `
        )
        .bind({
          bookId,
          currentTotalPages,
          targetTotalPages: body.targetTotalPages,
        })
        .one(summary);

      if (Number(summary.workedPages) > 0) {
        throw new BadRequestError('Coloring book page reduction would exclude worked pages.', {
          total_pages: new ValidationError(
            'validation_worked_pages',
            `Total pages cannot be less than ${Number(summary.highestWorkedPage)} because that page has saved work.`
          ),
        });
      }

      const hasHiddenPages = Number(summary.hiddenPages) > 0;
      const nextTotalPages = hasHiddenPages
        ? currentTotalPages
        : Math.max(body.targetTotalPages, currentTotalPages - maximumDeletedPages);
      const batchFilter = hasHiddenPages
        ? 'book = {:bookId} && page_number > {:currentTotalPages}'
        : 'book = {:bookId} && page_number > {:nextTotalPages} && page_number <= {:currentTotalPages}';
      const batch = txApp.findRecordsByFilter(
        'coloring_pages',
        batchFilter,
        '-page_number',
        maximumDeletedPages,
        0,
        { bookId, currentTotalPages, nextTotalPages }
      );

      for (let i = 0; i < batch.length; i += 1) {
        txApp.deleteWithContext(cleanupContext, batch[i]);
      }

      if (nextTotalPages !== currentTotalPages) {
        book.set('total_pages', nextTotalPages);
        txApp.saveWithContext(reductionContext, book);
      }

      const remainingPages = Math.max(0, Number(summary.extraPages) - batch.length);
      response = {
        bookId,
        currentTotalPages: nextTotalPages,
        targetTotalPages: body.targetTotalPages,
        deletedPages: batch.length,
        remainingPages,
        done: nextTotalPages === body.targetTotalPages && remainingPages === 0,
      };
    });

    return e.json(200, response);
  },
  $apis.requireAuth('users')
);

routerAdd(
  'POST',
  '/api/coloring/pages/{pageId}/main-photo',
  e => {
    if (!e.auth.getBool('verified')) {
      throw new ForbiddenError('Email verification is required.');
    }

    const body = new DynamicModel({ filename: '' });
    e.bindBody(body);
    const filename = String(body.filename || '').trim();
    if (filename === '') {
      throw new BadRequestError('Invalid main photo request.', {
        filename: new ValidationError(
          'validation_required',
          'Choose a photo to use as the main photo.'
        ),
      });
    }

    const pageId = e.request.pathValue('pageId');
    const authId = e.auth.getString('id');
    let response = null;

    e.app.runInTransaction(txApp => {
      const page = txApp.findRecordById('coloring_pages', pageId);
      const book = txApp.findRecordById('coloring_books', page.getString('book'));
      if (book.getString('user') !== authId) {
        throw new ForbiddenError('This coloring page is not owned by the current user.');
      }

      const photos = page.getStringSlice('photos');
      if (photos.indexOf(filename) === -1) {
        throw new ApiError(409, 'Photo list changed. Refresh and try again.', {
          filename: new ValidationError(
            'validation_photo_missing',
            'The selected photo is no longer attached to this page.'
          ),
        });
      }

      if (photos[0] !== filename) {
        const reorderedPhotos = [filename];
        for (let i = 0; i < photos.length; i += 1) {
          if (photos[i] !== filename) {
            reorderedPhotos.push(photos[i]);
          }
        }
        page.set('photos', reorderedPhotos);
        txApp.save(page);
      }

      response = page.publicExport();
    });

    return e.json(200, response);
  },
  $apis.requireAuth('users')
);

onRecordCreate(e => {
  const maximumGeneratedPages = 500;
  const isArchiveRestore = e.context.value('organized_glitter_archive_restore') === true;
  const requestedTotalPages = Number(e.record.get('total_pages'));
  if (
    !Number.isSafeInteger(requestedTotalPages) ||
    requestedTotalPages < 1 ||
    (!isArchiveRestore && requestedTotalPages > maximumGeneratedPages)
  ) {
    throw new BadRequestError('Invalid coloring book page count.', {
      total_pages: new ValidationError(
        'validation_page_count',
        `Total pages must be a whole number between 1 and ${maximumGeneratedPages}.`
      ),
    });
  }

  if (!e.record.getString('status')) {
    e.record.set('status', 'purchased');
  }
  if (
    !isArchiveRestore &&
    e.record.getString('date_completed') &&
    e.record.getString('status') !== 'archived' &&
    e.record.getString('status') !== 'destashed'
  ) {
    e.record.set('status', 'completed');
  }

  e.next();

  if (isArchiveRestore) {
    return;
  }

  const totalPages = requestedTotalPages;

  const pagesCollection = e.app.findCollectionByNameOrId('coloring_pages');
  const existingPages = e.app.findRecordsByFilter(
    'coloring_pages',
    'book = {:bookId} && page_number >= 1 && page_number <= {:totalPages}',
    'page_number',
    0,
    0,
    { bookId: e.record.id, totalPages }
  );
  const existingPageNumbers = {};
  for (let i = 0; i < existingPages.length; i += 1) {
    existingPageNumbers[existingPages[i].getInt('page_number')] = true;
  }

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    if (existingPageNumbers[pageNumber] !== true) {
      const page = new Record(pagesCollection);
      page.set('book', e.record.id);
      page.set('page_number', pageNumber);
      page.set('status', 'not_started');
      e.app.save(page);
    }
  }
}, 'coloring_books');

onRecordUpdate(e => {
  const maximumGeneratedPages = 500;
  const isArchiveRestore = e.context.value('organized_glitter_archive_restore') === true;
  const isBatchedReduction = e.context.value('organized_glitter_page_reduction') === true;
  const completionDate = e.record.getString('date_completed');
  const incomingStatus = e.record.getString('status');
  if (
    !isArchiveRestore &&
    completionDate &&
    completionDate !== e.record.original().getString('date_completed') &&
    incomingStatus !== 'archived' &&
    incomingStatus !== 'destashed'
  ) {
    e.record.set('status', 'completed');
  }
  const previousTotalPages = Number(e.record.original().get('total_pages'));
  const nextTotalPages = Number(e.record.get('total_pages'));
  if (!Number.isSafeInteger(nextTotalPages) || nextTotalPages < 1) {
    throw new BadRequestError('Invalid coloring book page count.', {
      total_pages: new ValidationError(
        'validation_page_count',
        `Total pages must be a whole number between 1 and ${maximumGeneratedPages}.`
      ),
    });
  }
  if (
    !isArchiveRestore &&
    nextTotalPages > maximumGeneratedPages &&
    nextTotalPages > previousTotalPages
  ) {
    throw new BadRequestError('Invalid coloring book page count.', {
      total_pages: new ValidationError(
        'validation_page_count',
        `Total pages cannot be increased above ${maximumGeneratedPages}.`
      ),
    });
  }
  const shouldUpdateMetrics = nextTotalPages !== previousTotalPages;

  if (!isArchiveRestore && !isBatchedReduction && nextTotalPages < previousTotalPages) {
    const reduction = new DynamicModel({
      extraPages: 0,
      highestWorkedPage: 0,
      workedPages: 0,
    });
    e.app
      .db()
      .newQuery(
        `
        WITH extra_pages AS (
          SELECT
            cp.page_number,
            CASE WHEN
              cp.status != 'not_started'
              OR COALESCE(cp.started_at, '') != ''
              OR COALESCE(cp.completed_at, '') != ''
              OR COALESCE(cp.revealed_subject, '') != ''
              OR COALESCE(cp.revealed_at, '') != ''
              OR COALESCE(cp.mediums, '') NOT IN ('', '[]', 'null')
              OR COALESCE(cp.photos, '') NOT IN ('', '[]', 'null')
                OR EXISTS (
                  SELECT 1 FROM coloring_page_color_references cr
                  WHERE cr.page = cp.id
                    AND (trim(cr.notes, char(9) || char(10) || char(13) || ' ') != ''
                      OR COALESCE(cr.photos, '') NOT IN ('', '[]', 'null'))
                )
              OR EXISTS (
                SELECT 1
                FROM coloring_page_progress_notes cpn
                WHERE cpn.page = cp.id
              )
            THEN 1 ELSE 0 END AS is_worked
          FROM coloring_pages cp
          WHERE cp.book = {:bookId}
            AND cp.page_number > {:nextTotalPages}
        )
        SELECT
          COUNT(*) AS extraPages,
          COALESCE(MAX(CASE WHEN is_worked = 1 THEN page_number ELSE 0 END), 0) AS highestWorkedPage,
          COALESCE(SUM(is_worked), 0) AS workedPages
        FROM extra_pages
      `
      )
      .bind({ bookId: e.record.id, nextTotalPages })
      .one(reduction);

    if (Number(reduction.workedPages) > 0) {
      throw new BadRequestError('Coloring book page reduction would exclude worked pages.', {
        total_pages: new ValidationError(
          'validation_worked_pages',
          `Total pages cannot be less than ${Number(reduction.highestWorkedPage)} because that page has saved work.`
        ),
      });
    }

    if (Number(reduction.extraPages) > maximumGeneratedPages) {
      throw new BadRequestError('Invalid coloring book page count.', {
        total_pages: new ValidationError(
          'validation_page_reduction_limit',
          'Reduce this coloring book in steps of 500 pages or fewer.'
        ),
      });
    }
  }

  if (!isArchiveRestore && shouldUpdateMetrics) {
    const metrics = new DynamicModel({ completedPages: 0 });
    e.app
      .db()
      .newQuery(
        `
        SELECT
          COALESCE(SUM(CASE WHEN cp.status = 'completed' THEN 1 ELSE 0 END), 0) AS completedPages
        FROM coloring_pages cp
        WHERE cp.book = {:bookId}
          AND cp.page_number <= {:nextTotalPages}
      `
      )
      .bind({ bookId: e.record.id, nextTotalPages })
      .one(metrics);

    const completedPages = Number(metrics.completedPages) || 0;
    const completionPercentage = Math.round(
      Math.min(100, Math.max(0, (completedPages / nextTotalPages) * 100))
    );
    e.record.set('completed_pages', completedPages);
    e.record.set('completion_percentage', completionPercentage);
    if (!isBatchedReduction && !e.record.getString('last_activity_at')) {
      e.record.set('last_activity_at', new Date().toISOString());
    }
  }

  e.next();

  if (isArchiveRestore) {
    return;
  }

  if (!isBatchedReduction && nextTotalPages <= maximumGeneratedPages) {
    const pagesCollection = e.app.findCollectionByNameOrId('coloring_pages');
    const existingPages = e.app.findRecordsByFilter(
      'coloring_pages',
      'book = {:bookId} && page_number >= 1 && page_number <= {:nextTotalPages}',
      'page_number',
      0,
      0,
      { bookId: e.record.id, nextTotalPages }
    );
    const existingPageNumbers = {};
    for (let i = 0; i < existingPages.length; i += 1) {
      existingPageNumbers[existingPages[i].getInt('page_number')] = true;
    }

    for (let pageNumber = 1; pageNumber <= nextTotalPages; pageNumber += 1) {
      if (existingPageNumbers[pageNumber] !== true) {
        const page = new Record(pagesCollection);
        page.set('book', e.record.id);
        page.set('page_number', pageNumber);
        page.set('status', 'not_started');
        e.app.save(page);
      }
    }
  }

  if (!isBatchedReduction && nextTotalPages < previousTotalPages) {
    const cleanupContext = new Context(e.context, 'organized_glitter_page_reduction_cleanup', true);
    const extraPages = e.app.findRecordsByFilter(
      'coloring_pages',
      'book = {:bookId} && page_number > {:nextTotalPages}',
      '-page_number',
      maximumGeneratedPages,
      0,
      { bookId: e.record.id, nextTotalPages }
    );
    for (let i = 0; i < extraPages.length; i += 1) {
      e.app.deleteWithContext(cleanupContext, extraPages[i]);
    }
  }
}, 'coloring_books');

onRecordCreate(e => {
  const isArchiveRestore = e.context.value('organized_glitter_archive_restore') === true;
  if (!e.record.getString('status')) {
    e.record.set('status', 'not_started');
  }
  if (!isArchiveRestore && e.record.getString('completed_at')) {
    e.record.set('status', 'completed');
  }

  const status = e.record.getString('status');
  const now = new Date().toISOString();

  e.next();

  if (isArchiveRestore || status === 'not_started') {
    return;
  }

  const bookId = e.record.getString('book');
  if (!bookId) {
    return;
  }

  let book = null;
  try {
    book = e.app.findRecordById('coloring_books', bookId);
  } catch {
    return;
  }

  const metrics = new DynamicModel({
    totalPages: 0,
    completedPages: 0,
  });

  e.app
    .db()
    .newQuery(
      `
      SELECT
        COALESCE(cb.total_pages, 0) AS totalPages,
        COALESCE(SUM(CASE WHEN cp.status = 'completed' THEN 1 ELSE 0 END), 0) AS completedPages
      FROM coloring_books cb
      LEFT JOIN coloring_pages cp ON cp.book = cb.id AND cp.page_number <= cb.total_pages
      WHERE cb.id = {:bookId}
      GROUP BY cb.id, cb.total_pages
    `
    )
    .bind({ bookId })
    .one(metrics);

  const totalPages = Number(metrics.totalPages) || 0;
  const completedPages = Number(metrics.completedPages) || 0;
  const completionPercentage =
    totalPages <= 0
      ? 0
      : Math.round(Math.min(100, Math.max(0, (completedPages / totalPages) * 100)));
  book.set('completed_pages', completedPages);
  book.set('completion_percentage', completionPercentage);
  book.set('last_activity_at', now);

  e.app.save(book);
}, 'coloring_pages');

onRecordUpdate(e => {
  const isArchiveRestore = e.context.value('organized_glitter_archive_restore') === true;
  const completionDate = e.record.getString('completed_at');
  if (
    !isArchiveRestore &&
    completionDate &&
    completionDate !== e.record.original().getString('completed_at')
  ) {
    e.record.set('status', 'completed');
  }
  const previousStatus = e.record.original().getString('status');
  const nextStatus = e.record.getString('status');
  const now = new Date().toISOString();

  e.next();

  if (isArchiveRestore) {
    return;
  }

  const bookId = e.record.getString('book');
  if (!bookId) {
    return;
  }

  let book = null;
  try {
    book = e.app.findRecordById('coloring_books', bookId);
  } catch {
    return;
  }

  const metrics = new DynamicModel({
    totalPages: 0,
    completedPages: 0,
  });

  e.app
    .db()
    .newQuery(
      `
      SELECT
        COALESCE(cb.total_pages, 0) AS totalPages,
        COALESCE(SUM(CASE WHEN cp.status = 'completed' THEN 1 ELSE 0 END), 0) AS completedPages
      FROM coloring_books cb
      LEFT JOIN coloring_pages cp ON cp.book = cb.id AND cp.page_number <= cb.total_pages
      WHERE cb.id = {:bookId}
      GROUP BY cb.id, cb.total_pages
    `
    )
    .bind({ bookId })
    .one(metrics);

  const totalPages = Number(metrics.totalPages) || 0;
  const completedPages = Number(metrics.completedPages) || 0;
  const completionPercentage =
    totalPages <= 0
      ? 0
      : Math.round(Math.min(100, Math.max(0, (completedPages / totalPages) * 100)));
  book.set('completed_pages', completedPages);
  book.set('completion_percentage', completionPercentage);
  book.set('last_activity_at', now);

  e.app.save(book);
}, 'coloring_pages');

onRecordDelete(e => {
  const isPageReductionCleanup =
    e.context.value('organized_glitter_page_reduction_cleanup') === true;
  const bookId = e.record.getString('book');
  const now = new Date().toISOString();

  e.next();

  if (isPageReductionCleanup || !bookId) {
    return;
  }

  let book = null;
  try {
    book = e.app.findRecordById('coloring_books', bookId);
  } catch {
    return;
  }

  const metrics = new DynamicModel({
    totalPages: 0,
    completedPages: 0,
  });

  e.app
    .db()
    .newQuery(
      `
      SELECT
        COALESCE(cb.total_pages, 0) AS totalPages,
        COALESCE(SUM(CASE WHEN cp.status = 'completed' THEN 1 ELSE 0 END), 0) AS completedPages
      FROM coloring_books cb
      LEFT JOIN coloring_pages cp ON cp.book = cb.id AND cp.page_number <= cb.total_pages
      WHERE cb.id = {:bookId}
      GROUP BY cb.id, cb.total_pages
    `
    )
    .bind({ bookId })
    .one(metrics);

  const totalPages = Number(metrics.totalPages) || 0;
  const completedPages = Number(metrics.completedPages) || 0;
  const completionPercentage =
    totalPages <= 0
      ? 0
      : Math.round(Math.min(100, Math.max(0, (completedPages / totalPages) * 100)));
  book.set('completed_pages', completedPages);
  book.set('completion_percentage', completionPercentage);
  book.set('last_activity_at', now);

  e.app.save(book);
}, 'coloring_pages');
