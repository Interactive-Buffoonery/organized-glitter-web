/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  'POST',
  '/api/coloring/pages/{pageId}/color-reference',
  e => {
    if (!e.auth.getBool('verified')) {
      throw new ForbiddenError('Email verification is required.');
    }

    const body = new DynamicModel({
      action: '',
      notes: '',
      baselineNotes: '',
      filename: '',
      requestId: '',
      restoreKey: '',
      restoreOffset: 0,
    });
    e.bindBody(body);
    if (['photos', 'notes', 'remove', 'restore'].indexOf(body.action) === -1) {
      throw new BadRequestError('Invalid color reference action.');
    }
    let files = [];
    if (body.action === 'photos' || body.action === 'restore') {
      try {
        files = e.findUploadedFiles('photos');
      } catch (_error) {
        files = [];
      }
    }
    if (body.action === 'photos' && files.length === 0) {
      throw new BadRequestError('Choose a photo first.');
    }
    if (
      (body.action === 'photos' && !/^[a-zA-Z0-9-]{1,80}$/.test(body.requestId)) ||
      (body.action === 'restore' && (!body.restoreKey || body.restoreKey.length > 200))
    ) {
      throw new BadRequestError('Invalid color reference save identifier.');
    }
    if (
      body.action === 'restore' &&
      (!Number.isSafeInteger(Number(body.restoreOffset)) ||
        Number(body.restoreOffset) < 0 ||
        files.length > 1)
    ) {
      throw new BadRequestError('Invalid swatch restore batch.');
    }
    const userId = e.auth.id;
    const pageId = e.request.pathValue('pageId');
    let result = null;
    let addedPhotoCount = 0;
    e.app.runInTransaction(txApp => {
      const page = txApp.findRecordById('coloring_pages', pageId);
      const book = txApp.findRecordById('coloring_books', page.getString('book'));
      if (book.getString('user') !== userId) throw new ForbiddenError();
      const records = txApp.findRecordsByFilter(
        'coloring_page_color_references',
        'page = {:page}',
        '',
        1,
        0,
        { page: pageId }
      );
      let record = records.length ? records[0] : null;
      if (record && record.getString('user') !== userId) throw new ForbiddenError();
      const receiptIds =
        (record ? JSON.parse(record.getString('upload_receipts') || '[]') : []) || [];
      if (body.action === 'photos' && receiptIds.indexOf(body.requestId) !== -1) {
        result = record;
        return;
      }
      // Restore receipts encode the offset and, when a sheet is part of the
      // batch, the exact filename it uploaded: "restore:{offset}:{filename}".
      // Bare "restore:{offset}" receipts are legacy (or notes-only batches)
      // and are validated positionally against the current photo count.
      const restoreOffsetNumber = body.action === 'restore' ? Number(body.restoreOffset) : 0;
      const restoreFilename = body.action === 'restore' && files.length ? files[0].name : '';
      const restoreReceipt =
        'restore:' + restoreOffsetNumber + (restoreFilename ? ':' + restoreFilename : '');
      const findRestoreReceipt = offset => {
        const bare = 'restore:' + offset;
        const prefix = bare + ':';
        for (let i = 0; i < receiptIds.length; i++) {
          const value = receiptIds[i];
          if (value === bare || value.indexOf(prefix) === 0) return value;
        }
        return null;
      };
      const isRestoreReceiptValid = (receipt, photos) => {
        if (!receipt) return false;
        const rest = receipt.slice('restore:'.length);
        const colonIndex = rest.indexOf(':');
        if (colonIndex === -1) {
          const offset = Number(rest);
          return Number.isSafeInteger(offset) && photos.length > offset;
        }
        const filename = rest.slice(colonIndex + 1);
        return photos.indexOf(filename) !== -1;
      };
      const existingRestoreReceipt =
        body.action === 'restore' ? findRestoreReceipt(restoreOffsetNumber) : null;
      if (
        body.action === 'restore' &&
        record &&
        record.getString('restore_key') === body.restoreKey &&
        isRestoreReceiptValid(existingRestoreReceipt, record.getStringSlice('photos'))
      ) {
        result = record;
        return;
      }
      if (
        body.action === 'restore' &&
        restoreOffsetNumber > 0 &&
        (!record || !findRestoreReceipt(restoreOffsetNumber - 1))
      ) {
        throw new ApiError(409, 'The previous swatch restore batch is missing.');
      }
      if (
        body.action === 'restore' &&
        record &&
        record.getString('restore_key') !== body.restoreKey
      ) {
        throw new ApiError(
          409,
          'This page already has a color reference. Its saved content was preserved.'
        );
      }
      if (!record) {
        record = new Record(txApp.findCollectionByNameOrId('coloring_page_color_references'));
        record.set('page', pageId);
        record.set('user', userId);
      }
      if (body.action === 'notes') {
        if (
          record.getString('notes') === body.notes &&
          !record.isNew() &&
          (record.getString('notes').trim() || record.getStringSlice('photos').length)
        ) {
          result = record;
          return;
        }
        if (record.getString('notes') !== body.baselineNotes) {
          throw new ApiError(
            409,
            'The notes changed. Cancel and reopen the editor to load the saved notes.'
          );
        }
        record.set('notes', body.notes);
      } else if (body.action === 'restore' && restoreOffsetNumber === 0 && record.isNew()) {
        // Photo retries must not replay the notes phase, including a later clear.
        record.set('notes', body.notes);
      }
      if (files.length) record.set('photos+', files);
      if (body.action === 'restore') {
        record.set('restore_key', body.restoreKey);
        // Drop any stale receipt for this exact offset (e.g. one left behind
        // by a prior attempt whose photo was later removed) before recording
        // the fresh one, so retries never accumulate duplicate offsets.
        record.set(
          'upload_receipts',
          receiptIds.filter(value => value !== existingRestoreReceipt).concat([restoreReceipt])
        );
      }
      if (body.action === 'photos')
        record.set(
          'upload_receipts',
          receiptIds
            .filter(value => value.indexOf('restore:') === 0)
            .concat(
              receiptIds
                .filter(value => value.indexOf('restore:') !== 0)
                .concat([body.requestId])
                .slice(-200)
            )
        );
      if (body.action === 'remove') {
        const previousPhotos = record.getStringSlice('photos');
        const filenameReceipts = receiptIds.map(value => {
          if (!/^restore:\d+$/.test(value)) return value;
          const offset = Number(value.slice('restore:'.length));
          return Number.isSafeInteger(offset) && previousPhotos[offset]
            ? value + ':' + previousPhotos[offset]
            : value;
        });
        record.set('photos-', [body.filename]);
        // A removed sheet may have come from a completed restore batch;
        // prune the receipts that pointed at it so a later restore retry
        // with the same restoreKey re-uploads it instead of no-op'ing.
        const remainingPhotos = record.getStringSlice('photos');
        record.set(
          'upload_receipts',
          filenameReceipts.filter(
            value =>
              value.indexOf('restore:') !== 0 || isRestoreReceiptValid(value, remainingPhotos)
          )
        );
      }
      if (
        !record.getString('notes').trim() &&
        !record.getStringSlice('photos').length &&
        !files.length
      ) {
        if (!record.isNew()) txApp.delete(record);
        return;
      }
      txApp.save(record);
      addedPhotoCount = files.length;
      result = record;
    });
    return e.json(200, { reference: result, addedPhotoCount });
  },
  $apis.requireAuth('users'),
  $apis.bodyLimit(200 * 1024 * 1024)
);
