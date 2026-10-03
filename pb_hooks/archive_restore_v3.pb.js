/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  'GET',
  '/api/archive/capabilities',
  e => {
    if (!e.auth.getBool('verified')) throw new ForbiddenError('Email verification is required.');
    const roleFields = {
      'project-cover': ['projects', 'image'],
      'project-progress-note': ['progress_notes', 'image'],
      'coloring-book-cover': ['coloring_books', 'cover_image'],
      'coloring-page-photo': ['coloring_pages', 'photos'],
      'coloring-page-progress-note': ['coloring_page_progress_notes', 'image'],
      'coloring-swatch-photo': ['coloring_page_color_references', 'photos'],
    };
    const maxAssetBytesByRole = {};
    for (const role of Object.keys(roleFields)) {
      const [collection, field] = roleFields[role];
      maxAssetBytesByRole[role] = e.app
        .findCollectionByNameOrId(collection)
        .fields.getByName(field).maxSize;
    }
    return e.json(200, {
      restoreSchemaVersions: [1, 2, 3],
      multipartRestore: true,
      maxPartBytes: 536870912,
      maxAssetBytesByRole,
      maxRestoreRequestChars: 500000,
      maxMetadataStringChars: 100000,
      maxMetadataListEntries: 1000,
      maxMetadataListEntryChars: 255,
      maxMetadataNumber: 1000000000,
      maxAssetPosition: 1000000,
      receiptVersion: 1,
    });
  },
  $apis.requireAuth('users')
);
routerAdd(
  'POST',
  '/api/archive/v3/restore-item',
  e => {
    if (!e.auth.getBool('verified')) throw new ForbiddenError('Email verification is required.');
    const authId = e.auth.id;
    const body = new DynamicModel({ request: '' });
    e.bindBody(body);
    if (typeof body.request !== 'string' || body.request.length > 500000) {
      throw new BadRequestError('Invalid archive restore request.');
    }
    let request = null;
    try {
      request = JSON.parse(body.request);
    } catch (_error) {
      throw new BadRequestError('Invalid archive restore request.');
    }
    const item = request && request.item;
    const kinds = [
      'diamond-project',
      'diamond-project-note',
      'coloring-medium',
      'coloring-book',
      'coloring-page',
      'coloring-page-note',
      'coloring-color-reference',
      'asset',
    ];
    const roles = [
      'project-cover',
      'project-progress-note',
      'coloring-book-cover',
      'coloring-page-photo',
      'coloring-page-progress-note',
      'coloring-swatch-photo',
    ];
    const roleFields = {
      'project-cover': ['projects', 'image'],
      'project-progress-note': ['progress_notes', 'image'],
      'coloring-book-cover': ['coloring_books', 'cover_image'],
      'coloring-page-photo': ['coloring_pages', 'photos'],
      'coloring-page-progress-note': ['coloring_page_progress_notes', 'image'],
      'coloring-swatch-photo': ['coloring_page_color_references', 'photos'],
    };
    const isId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9:._-]{0,254}$/.test(value);
    const isDigest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
    const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const canonicalJson = value => {
      if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
      if (isObject(value))
        return (
          '{' +
          Object.keys(value)
            .sort()
            .filter(key => value[key] !== undefined)
            .map(key => JSON.stringify(key) + ':' + canonicalJson(value[key]))
            .join(',') +
          '}'
        );
      return JSON.stringify(value);
    };
    const withoutDigest = value => {
      const copy = { ...value };
      delete copy.digest;
      return copy;
    };
    const descriptorDigest = value =>
      $security.sha256(canonicalJson({ ...withoutDigest(value), assets: [] }));
    const itemDigest = value => $security.sha256(canonicalJson(withoutDigest(value)));
    const metadataFields = {
      'diamond-project': {
        title: 's',
        company: 's?',
        artist: 's?',
        status: 's',
        kitCategory: 's?',
        drillShape: 's?',
        width: 'n?',
        height: 'n?',
        totalDiamonds: 'i?',
        colorCount: 'i?',
        datePurchased: 's?',
        dateReceived: 's?',
        dateStarted: 's?',
        dateCompleted: 's?',
        generalNotes: 's?',
        sourceUrl: 's?',
        tags: 'a',
      },
      'diamond-project-note': { content: 's', date: 's' },
      'coloring-medium': { name: 's', type: 's', brand: 's?', colorCount: 'i?', notes: 's?' },
      'coloring-book': {
        title: 's',
        publisher: 's?',
        illustrator: 's?',
        series: 's?',
        theme: 's?',
        isbn: 's?',
        publicationYear: 'i?',
        edition: 's?',
        language: 's?',
        sourceUrl: 's?',
        datePurchased: 's?',
        dateReceived: 's?',
        dateStarted: 's?',
        dateCompleted: 's?',
        bookFormat: 's?',
        notes: 's?',
        isMystery: 'b',
        status: 's',
        totalPages: 'i',
        completedPages: 'i?',
        completionPercentage: 'n?',
        lastActivityAt: 's?',
        tags: 'a',
      },
      'coloring-page': {
        pageNumber: 'i',
        status: 's',
        mediumItemIds: 'a',
        revealedSubject: 's?',
        revealedAt: 's?',
        startedAt: 's?',
        completedAt: 's?',
      },
      'coloring-page-note': { content: 's', date: 's' },
      'coloring-color-reference': { notes: 's' },
      asset: { position: 'i', ownerItemId: 's?' },
    };
    const validateMetadata = (kind, metadata) => {
      const fields = metadataFields[kind];
      if (!fields || !isObject(metadata)) throw new BadRequestError('Invalid archive metadata.');
      for (const key of Object.keys(metadata)) {
        if (!Object.prototype.hasOwnProperty.call(fields, key))
          throw new BadRequestError('Invalid archive metadata field.');
      }
      for (const key of Object.keys(fields)) {
        const rule = fields[key];
        const value = metadata[key];
        if (value === undefined && rule.endsWith('?')) continue;
        const type = rule[0];
        if (type === 's' && (typeof value !== 'string' || value.length > 100000))
          throw new BadRequestError('Invalid archive text metadata.');
        if (type === 'b' && typeof value !== 'boolean')
          throw new BadRequestError('Invalid archive boolean metadata.');
        if (
          (type === 'n' || type === 'i') &&
          (typeof value !== 'number' ||
            !Number.isFinite(value) ||
            value < 0 ||
            value > 1000000000 ||
            (type === 'i' && !Number.isSafeInteger(value)))
        )
          throw new BadRequestError('Invalid archive number metadata.');
        if (
          type === 'a' &&
          (!Array.isArray(value) ||
            value.length > 1000 ||
            value.some(entry => typeof entry !== 'string' || entry.length > 255))
        )
          throw new BadRequestError('Invalid archive list metadata.');
      }
      if (kind === 'asset' && metadata.position > 1000000)
        throw new BadRequestError('Invalid archive photo position.');
      if (kind === 'coloring-book' && metadata.completionPercentage > 100)
        throw new BadRequestError('Invalid book completion percentage.');
    };
    const validateDescriptor = (value, depth) => {
      if (
        !isObject(value) ||
        depth > 2 ||
        !isId(value.itemId) ||
        ['diamond-project', 'coloring-book', 'coloring-page'].indexOf(value.kind) === -1 ||
        !isDigest(value.digest) ||
        Object.keys(value).some(
          key => ['itemId', 'kind', 'digest', 'metadata', 'parent'].indexOf(key) === -1
        )
      )
        throw new BadRequestError('Invalid archive parent descriptor.');
      validateMetadata(value.kind, value.metadata);
      if (value.kind === 'coloring-page') {
        if (!value.parent || value.parent.kind !== 'coloring-book')
          throw new BadRequestError('Coloring page parent is missing its book descriptor.');
        validateDescriptor(value.parent, depth + 1);
      } else if (value.parent !== undefined) {
        throw new BadRequestError('Unexpected nested archive parent.');
      }
      if (descriptorDigest(value) !== value.digest)
        throw new BadRequestError('Archive parent descriptor digest mismatch.');
    };
    // SHA-256 compression/update/finalization adapted without algorithm changes
    // from fast-sha256 1.3.0 (Dmitry Chestnykh, public domain, no warranty):
    // https://github.com/dchest/fast-sha256-js/tree/v1.3.0
    // PocketBase's $security.sha256 accepts text, so it cannot hash arbitrary bytes.
    const createBinarySha256 = () => {
      const constants = new Uint32Array([
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
      ]);
      const state = new Int32Array([
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
      ]);
      const words = new Int32Array(64);
      const pending = [];
      let byteCount = 0;
      const block = bytes => {
        let i = 0;
        for (; i < 16; i += 1) {
          const j = i * 4;
          words[i] =
            ((bytes[j] & 255) << 24) |
            ((bytes[j + 1] & 255) << 16) |
            ((bytes[j + 2] & 255) << 8) |
            (bytes[j + 3] & 255);
        }
        for (; i < 64; i += 1) {
          let value = words[i - 2];
          const s1 =
            ((value >>> 17) | (value << 15)) ^ ((value >>> 19) | (value << 13)) ^ (value >>> 10);
          value = words[i - 15];
          const s0 =
            ((value >>> 7) | (value << 25)) ^ ((value >>> 18) | (value << 14)) ^ (value >>> 3);
          words[i] = ((s1 + words[i - 7]) | 0) + ((s0 + words[i - 16]) | 0);
        }
        let a = state[0],
          b = state[1],
          c = state[2],
          d = state[3];
        let f = state[5],
          g = state[6],
          h = state[7],
          ee = state[4];
        for (i = 0; i < 64; i += 1) {
          const t1 =
            ((((((ee >>> 6) | (ee << 26)) ^
              ((ee >>> 11) | (ee << 21)) ^
              ((ee >>> 25) | (ee << 7))) +
              ((ee & f) ^ (~ee & g))) |
              0) +
              ((h + ((constants[i] + words[i]) | 0)) | 0)) |
            0;
          const t2 =
            ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) +
              ((a & b) ^ (a & c) ^ (b & c))) |
            0;
          h = g;
          g = f;
          f = ee;
          ee = (d + t1) | 0;
          d = c;
          c = b;
          b = a;
          a = (t1 + t2) | 0;
        }
        state[0] = (state[0] + a) | 0;
        state[1] = (state[1] + b) | 0;
        state[2] = (state[2] + c) | 0;
        state[3] = (state[3] + d) | 0;
        state[4] = (state[4] + ee) | 0;
        state[5] = (state[5] + f) | 0;
        state[6] = (state[6] + g) | 0;
        state[7] = (state[7] + h) | 0;
      };
      return {
        update(bytes, length) {
          byteCount += length;
          for (let i = 0; i < length; i += 1) {
            pending.push(bytes[i] & 255);
            if (pending.length === 64) block(pending.splice(0, 64));
          }
        },
        digest() {
          const bitHigh = Math.floor(byteCount / 0x20000000);
          const bitLow = (byteCount << 3) >>> 0;
          pending.push(0x80);
          while (pending.length % 64 !== 56) pending.push(0);
          pending.push(
            bitHigh >>> 24,
            bitHigh >>> 16,
            bitHigh >>> 8,
            bitHigh,
            bitLow >>> 24,
            bitLow >>> 16,
            bitLow >>> 8,
            bitLow
          );
          while (pending.length) block(pending.splice(0, 64));
          let hex = '';
          for (let i = 0; i < state.length; i += 1)
            hex += (state[i] >>> 0).toString(16).padStart(8, '0');
          return hex;
        },
      };
    };
    const uploadedDigest = file => {
      const hasher = createBinarySha256();
      const reader = file.reader.open();
      const chunk = new Uint8Array(65536);
      let read = 0;
      try {
        while (read < file.size) {
          const count = reader.read(chunk);
          if (!count) break;
          hasher.update(chunk, count);
          read += count;
        }
      } finally {
        reader.close();
      }
      if (read !== file.size)
        throw new BadRequestError('Could not read the complete archive asset.');
      return hasher.digest();
    };
    if (
      !request ||
      typeof request.backupId !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(request.backupId) ||
      !Number.isSafeInteger(request.partNumber) ||
      !Number.isSafeInteger(request.partCount) ||
      request.partNumber < 1 ||
      request.partCount < request.partNumber ||
      !isDigest(request.inventoryDigest) ||
      !isObject(item) ||
      !isId(item.itemId) ||
      kinds.indexOf(item.kind) === -1 ||
      !isDigest(item.digest) ||
      !isObject(item.metadata) ||
      !Array.isArray(item.assets) ||
      item.assets.length > 1
    ) {
      throw new BadRequestError('Invalid archive restore request.');
    }
    if (
      Object.keys(item).some(
        key => ['itemId', 'kind', 'digest', 'metadata', 'parent', 'assets'].indexOf(key) === -1
      )
    )
      throw new BadRequestError('Invalid archive item field.');
    validateMetadata(item.kind, item.metadata);
    if (item.parent !== undefined) validateDescriptor(item.parent, 0);
    if (
      ['diamond-project', 'coloring-book', 'coloring-medium'].indexOf(item.kind) !== -1 &&
      item.parent !== undefined
    )
      throw new BadRequestError('Root archive item cannot have a parent.');
    if (itemDigest(item) !== item.digest)
      throw new BadRequestError('Archive item digest mismatch.');
    const declaredFiles = {};
    for (const asset of item.assets) declaredFiles['asset:' + asset.assetId] = true;
    const multipart = e.request.multipartForm;
    const allFiles = multipart && multipart.file;
    if (
      !allFiles ||
      Object.keys(allFiles).some(key => !declaredFiles[key] || allFiles[key].length !== 1) ||
      Object.keys(allFiles).length !== item.assets.length
    )
      throw new BadRequestError('Archive uploads do not match the item inventory.');
    const uploadedById = {};
    for (let i = 0; i < item.assets.length; i += 1) {
      const asset = item.assets[i];
      const expectedAsset = {
        'diamond-project': ['project-cover', 'image'],
        'diamond-project-note': ['project-progress-note', 'image'],
        'coloring-book': ['coloring-book-cover', 'cover_image'],
        'coloring-page-note': ['coloring-page-progress-note', 'image'],
        asset: [asset.role, 'photos'],
      }[item.kind];
      if (
        !isObject(asset) ||
        !isId(asset.assetId) ||
        !isDigest(asset.digest) ||
        !Number.isSafeInteger(asset.byteLength) ||
        asset.byteLength < 0 ||
        (Object.prototype.hasOwnProperty.call(roleFields, asset.role) &&
          asset.byteLength >
            e.app
              .findCollectionByNameOrId(roleFields[asset.role][0])
              .fields.getByName(roleFields[asset.role][1]).maxSize) ||
        typeof asset.path !== 'string' ||
        asset.path.indexOf('assets/') !== 0 ||
        asset.path.indexOf('..') !== -1 ||
        roles.indexOf(asset.role) === -1 ||
        !expectedAsset ||
        asset.role !== expectedAsset[0] ||
        asset.field !== expectedAsset[1] ||
        (item.kind === 'asset' &&
          (!item.parent ||
            item.parent.kind !== 'coloring-page' ||
            ['coloring-page-photo', 'coloring-swatch-photo'].indexOf(asset.role) === -1))
      ) {
        throw new BadRequestError('Invalid archive asset descriptor.');
      }
      let files = [];
      try {
        files = e.findUploadedFiles('asset:' + asset.assetId);
      } catch (_error) {
        files = [];
      }
      if (files.length !== 1 || files[0].size !== asset.byteLength) {
        throw new BadRequestError('Archive asset is missing or has the wrong size.');
      }
      const actualDigest = uploadedDigest(files[0]);
      if (actualDigest !== asset.digest) {
        throw new ApiError(400, 'Archive asset content does not match its digest.', {
          reason: new ValidationError(
            'archive_asset_digest_mismatch',
            'The uploaded asset content does not match its digest.'
          ),
        });
      }
      const extensionMatch = String(files[0].name || '').match(/\.([a-zA-Z0-9]{1,10})$/);
      files[0].name =
        'ogrestore_' +
        asset.digest.slice(0, 20) +
        '_' +
        $security.sha256(asset.assetId).slice(0, 10) +
        (extensionMatch ? '.' + extensionMatch[1] : '');
      uploadedById[asset.assetId] = files[0];
    }
    if (item.kind === 'asset' && item.assets.length !== 1) {
      throw new BadRequestError('Archive photo items require exactly one asset.');
    }

    const context = new Context(e.request.context(), 'organized_glitter_archive_restore', true);
    const targetDeletedError = () =>
      new ApiError(409, 'A previously restored archive target was deleted.', {
        reason: new ValidationError(
          'archive_target_deleted',
          'The previously restored target was deleted.'
        ),
      });
    let response = null;
    e.app.runInTransaction(txApp => {
      const deterministicId = value =>
        $security.sha256(authId + '\0' + request.backupId + '\0' + value).slice(0, 15);
      const findReceipt = itemId => {
        const rows = txApp.findRecordsByFilter(
          'archive_restore_items',
          'user = {:user} && backup_id = {:backup} && item_id = {:item}',
          '',
          1,
          0,
          { user: authId, backup: request.backupId, item: itemId }
        );
        return rows.length ? rows[0] : null;
      };
      const archiveItemDigestConflicts = (receipt, archiveItem, state) => {
        if (receipt.getString('state') === 'scaffold') {
          return (
            receipt.getString('descriptor_digest') !==
            (state === 'scaffold' ? archiveItem.digest : descriptorDigest(archiveItem))
          );
        }
        return receipt.getString('item_digest') !== archiveItem.digest;
      };
      const archiveItemDigestConflictError = () =>
        new ApiError(409, 'Archive item identity conflicts with an earlier restore.', {
          reason: new ValidationError(
            'archive_item_digest_conflict',
            'The archive item digest conflicts with an earlier restore.'
          ),
        });
      const saveReceipt = (archiveItem, state, collection, recordId, field, storedFilename) => {
        let receipt = findReceipt(archiveItem.itemId);
        if (receipt) {
          if (archiveItemDigestConflicts(receipt, archiveItem, state))
            throw archiveItemDigestConflictError();
        } else {
          receipt = new Record(txApp.findCollectionByNameOrId('archive_restore_items'));
          receipt.set('user', authId);
          receipt.set('backup_id', request.backupId);
          receipt.set('item_id', archiveItem.itemId);
          receipt.set('item_kind', archiveItem.kind);
        }
        if (state === 'scaffold') {
          receipt.set('descriptor_digest', archiveItem.digest);
          receipt.set('item_digest', archiveItem.digest);
        } else {
          receipt.set('item_digest', archiveItem.digest);
          if (
            ['diamond-project', 'coloring-book', 'coloring-page'].indexOf(archiveItem.kind) !== -1
          )
            receipt.set('descriptor_digest', descriptorDigest(archiveItem));
        }
        receipt.set('state', state);
        receipt.set('target_collection', collection);
        receipt.set('target_record_id', recordId);
        receipt.set('target_field', field || '');
        receipt.set('stored_filename', storedFilename || '');
        if (archiveItem.kind === 'asset')
          receipt.set('asset_position', archiveItem.metadata.position);
        txApp.save(receipt);
        return receipt;
      };
      const owned = (collection, record) => {
        if (
          collection === 'projects' ||
          collection === 'coloring_books' ||
          collection === 'coloring_mediums'
        ) {
          return record.getString('user') === authId;
        }
        if (collection === 'progress_notes') {
          return (
            txApp.findRecordById('projects', record.getString('project')).getString('user') ===
            authId
          );
        }
        if (collection === 'coloring_pages') {
          return (
            txApp.findRecordById('coloring_books', record.getString('book')).getString('user') ===
            authId
          );
        }
        if (
          collection === 'coloring_page_progress_notes' ||
          collection === 'coloring_page_color_references'
        ) {
          return record.getString('user') === authId;
        }
        return false;
      };
      const findOwned = (collection, id) => {
        let record = null;
        try {
          record = txApp.findRecordById(collection, id);
        } catch (_error) {
          record = null;
        }
        if (record && !owned(collection, record)) throw new ForbiddenError();
        return record;
      };
      const getOrCreateNamed = (collection, name, extra, matches) => {
        if (typeof name !== 'string' || !name.trim()) return '';
        const clean = name.trim();
        // SQLite LOWER uses ASCII case folding; use the same key for lookup and IDs.
        const normalizedName = clean.replace(/[A-Z]/g, letter => letter.toLowerCase());
        const cachedId = matches?.get(normalizedName);
        if (cachedId) return cachedId;
        if (!matches || cachedId === null) {
          const match = new Record();
          try {
            txApp
              .recordQuery(collection)
              .andWhere(
                $dbx.exp('user = {:user} AND LOWER(TRIM(name)) = {:name}', {
                  user: authId,
                  name: normalizedName,
                })
              )
              .limit(1)
              .one(match);
            if (match.id) {
              matches?.set(normalizedName, match.id);
              return match.id;
            }
          } catch (_error) {
            // No owned record with this normalized name exists.
          }
        }
        const record = new Record(txApp.findCollectionByNameOrId(collection));
        record.set('id', deterministicId('taxonomy:' + collection + ':' + normalizedName));
        record.set('user', authId);
        record.set('name', clean);
        if (extra) extra(record);
        txApp.save(record);
        matches?.set(normalizedName, record.id);
        return record.id;
      };
      const restoreTags = (names, tagCollection, joinCollection, ownerField, ownerId) => {
        const seen = new Set();
        const entries = [];
        names.forEach(value => {
          if (typeof value !== 'string' || !value.trim()) return;
          const name = value.trim();
          const key = name.toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          entries.push({ name, key });
        });
        if (!entries.length) return;

        const matches = new Map(
          entries.map(({ name }) => [name.replace(/[A-Z]/g, letter => letter.toLowerCase()), ''])
        );
        const normalizedNames = Array.from(matches.keys());
        for (let offset = 0; offset < normalizedNames.length; offset += 250) {
          const params = { user: authId };
          const placeholders = normalizedNames.slice(offset, offset + 250).map((name, index) => {
            params['name' + index] = name;
            return '{:name' + index + '}';
          });
          const rows = arrayOf(new DynamicModel({ id: '', normalizedName: '' }));
          txApp
            .db()
            .newQuery(
              'SELECT id, LOWER(TRIM(name)) AS normalizedName FROM ' +
                tagCollection +
                ' WHERE user = {:user} AND LOWER(TRIM(name)) IN (' +
                placeholders.join(',') +
                ')'
            )
            .bind(params)
            .all(rows);
          rows.forEach(row => {
            // Preserve the original LIMIT 1 selection when case variants coexist.
            matches.set(row.normalizedName, matches.get(row.normalizedName) === '' ? row.id : null);
          });
        }

        const joins = entries.map(({ name, key }) => {
          const tagId = getOrCreateNamed(
            tagCollection,
            name,
            record => {
              record.set('slug', key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tag');
              record.set('color', '#8b5cf6');
            },
            matches
          );
          return {
            tagId,
            id: deterministicId('taxonomy-join:' + joinCollection + ':' + ownerId + ':' + tagId),
          };
        });
        const existingJoins = new Set();
        for (let offset = 0; offset < joins.length; offset += 250) {
          const params = {};
          const placeholders = joins.slice(offset, offset + 250).map((join, index) => {
            params['id' + index] = join.id;
            return '{:id' + index + '}';
          });
          const rows = arrayOf(new DynamicModel({ id: '' }));
          txApp
            .db()
            .newQuery(
              'SELECT id FROM ' + joinCollection + ' WHERE id IN (' + placeholders.join(',') + ')'
            )
            .bind(params)
            .all(rows);
          rows.forEach(row => existingJoins.add(row.id));
        }
        joins.forEach(({ id, tagId }) => {
          if (existingJoins.has(id)) return;
          const join = new Record(txApp.findCollectionByNameOrId(joinCollection));
          join.set('id', id);
          join.set(ownerField, ownerId);
          join.set('tag', tagId);
          txApp.save(join);
          existingJoins.add(id);
        });
      };
      const validateParent = parent => validateDescriptor(parent, 0);
      const createProject = archiveItem => {
        const m = archiveItem.metadata;
        if (typeof m.title !== 'string' || !m.title.trim() || typeof m.status !== 'string') {
          throw new BadRequestError('Invalid diamond project metadata.');
        }
        const id = deterministicId(archiveItem.itemId);
        let record = findOwned('projects', id);
        if (record) return record;
        record = new Record(txApp.findCollectionByNameOrId('projects'));
        record.set('id', id);
        record.set('user', authId);
        record.set('title', m.title.trim());
        record.set('status', m.status);
        record.set('kit_category', m.kitCategory || 'full');
        record.set('drill_shape', m.drillShape || '');
        record.set('width', m.width || 0);
        record.set('height', m.height || 0);
        record.set('total_diamonds', m.totalDiamonds || 0);
        record.set('color_count', m.colorCount || 0);
        record.set('date_purchased', m.datePurchased || '');
        record.set('date_received', m.dateReceived || '');
        record.set('date_started', m.dateStarted || '');
        record.set('date_completed', m.dateCompleted || '');
        record.set('general_notes', m.generalNotes || '');
        record.set('source_url', m.sourceUrl || '');
        record.set('company', getOrCreateNamed('companies', m.company));
        record.set('artist', getOrCreateNamed('artists', m.artist));
        txApp.saveWithContext(context, record);
        restoreTags(m.tags, 'tags', 'project_tags', 'project', record.id);
        return record;
      };
      const createBook = archiveItem => {
        const m = archiveItem.metadata;
        if (
          typeof m.title !== 'string' ||
          !m.title.trim() ||
          typeof m.status !== 'string' ||
          !Number.isSafeInteger(m.totalPages) ||
          m.totalPages < 0
        ) {
          throw new BadRequestError('Invalid coloring book metadata.');
        }
        const id = deterministicId(archiveItem.itemId);
        let record = findOwned('coloring_books', id);
        if (record) return record;
        record = new Record(txApp.findCollectionByNameOrId('coloring_books'));
        record.set('id', id);
        record.set('user', authId);
        record.set('title', m.title.trim());
        record.set('status', m.status);
        record.set('total_pages', m.totalPages);
        record.set('publisher', getOrCreateNamed('book_publishers', m.publisher));
        record.set('illustrator', getOrCreateNamed('book_illustrators', m.illustrator));
        record.set('series', m.series || '');
        record.set('theme', m.theme || '');
        record.set('isbn', m.isbn || '');
        record.set('publication_year', m.publicationYear || 0);
        record.set('edition', m.edition || '');
        record.set('language', m.language || '');
        record.set('source_url', m.sourceUrl || '');
        record.set('date_purchased', m.datePurchased || '');
        record.set('date_received', m.dateReceived || '');
        record.set('date_started', m.dateStarted || '');
        record.set('date_completed', m.dateCompleted || '');
        record.set('book_format', m.bookFormat || '');
        record.set('notes', m.notes || '');
        record.set('is_mystery', !!m.isMystery);
        record.set('completed_pages', m.completedPages || 0);
        record.set('completion_percentage', m.completionPercentage || 0);
        record.set('last_activity_at', m.lastActivityAt || '');
        txApp.saveWithContext(context, record);
        restoreTags(m.tags, 'coloring_tags', 'coloring_book_tags', 'book', record.id);
        return record;
      };
      let scaffoldedParentCount = 0;
      const ensureParent = (parent, countScaffold = true) => {
        validateParent(parent);
        const existingReceipt = findReceipt(parent.itemId);
        if (existingReceipt && existingReceipt.getString('descriptor_digest') !== parent.digest) {
          throw new ApiError(409, 'Archive parent descriptor conflicts with an earlier part.', {
            reason: 'archive_parent_descriptor_conflict',
          });
        }
        let record = null;
        let ancestor = null;
        let metadata = null;
        let collection = '';
        if (parent.kind === 'diamond-project') {
          collection = 'projects';
        } else if (parent.kind === 'coloring-book') {
          collection = 'coloring_books';
        } else {
          ancestor = ensureParent(parent.parent);
          metadata = parent.metadata;
          if (
            !Number.isSafeInteger(metadata.pageNumber) ||
            metadata.pageNumber < 1 ||
            typeof metadata.status !== 'string'
          ) {
            throw new BadRequestError('Invalid coloring page metadata.');
          }
          collection = 'coloring_pages';
        }
        if (existingReceipt) {
          if (
            existingReceipt.getString('target_collection') !== collection ||
            !findOwned(collection, existingReceipt.getString('target_record_id'))
          ) {
            throw targetDeletedError();
          }
        }
        if (parent.kind === 'diamond-project') {
          record = createProject(parent);
        } else if (parent.kind === 'coloring-book') {
          record = createBook(parent);
        } else {
          const id = deterministicId(parent.itemId);
          record = findOwned(collection, id);
          if (!record) {
            const totalPages = ancestor.getInt('total_pages');
            const previousCompleted = txApp.countRecords(
              'coloring_pages',
              $dbx.exp("book = {:book} AND status = 'completed' AND page_number <= {:total}", {
                book: ancestor.id,
                total: totalPages,
              })
            );
            record = new Record(txApp.findCollectionByNameOrId(collection));
            record.set('id', id);
            record.set('book', ancestor.id);
            record.set('page_number', metadata.pageNumber);
            record.set('status', metadata.status);
            record.set('revealed_subject', metadata.revealedSubject || '');
            record.set('revealed_at', metadata.revealedAt || '');
            record.set('started_at', metadata.startedAt || '');
            record.set('completed_at', metadata.completedAt || '');
            const mediumIds = metadata.mediumItemIds.map(mediumItemId => {
              const medium = findOwned('coloring_mediums', deterministicId(mediumItemId));
              if (!medium) throw new ApiError(409, 'Restore the referenced coloring medium first.');
              return medium.id;
            });
            record.set('mediums', mediumIds);
            txApp.saveWithContext(context, record);
            const previousPercentage =
              totalPages > 0
                ? Math.round(Math.min(100, (previousCompleted / totalPages) * 100))
                : 0;
            const archiveMetrics = parent.parent.metadata;
            const currentCompleted = ancestor.getInt('completed_pages');
            const currentPercentage = ancestor.getInt('completion_percentage');
            const stillUnedited =
              (currentCompleted === (archiveMetrics.completedPages || 0) &&
                currentPercentage === (archiveMetrics.completionPercentage || 0)) ||
              (currentCompleted === previousCompleted && currentPercentage === previousPercentage);
            if (stillUnedited) {
              const completed =
                previousCompleted +
                (metadata.status === 'completed' && metadata.pageNumber <= totalPages ? 1 : 0);
              ancestor.set('completed_pages', completed);
              ancestor.set(
                'completion_percentage',
                totalPages > 0 ? Math.round(Math.min(100, (completed / totalPages) * 100)) : 0
              );
              txApp.saveWithContext(context, ancestor);
            }
          }
        }
        if (!existingReceipt) {
          saveReceipt(parent, 'scaffold', collection, record.id, '', '');
          if (countScaffold) scaffoldedParentCount += 1;
        }
        return record;
      };

      let receipt = findReceipt(item.itemId);
      if (receipt) {
        if (archiveItemDigestConflicts(receipt, item, 'complete'))
          throw archiveItemDigestConflictError();
        if (receipt.getString('state') === 'complete') {
          if (
            !findOwned(
              receipt.getString('target_collection'),
              receipt.getString('target_record_id')
            )
          ) {
            throw targetDeletedError();
          }
          response = {
            outcome: 'already_applied',
            itemId: item.itemId,
            targetRecordId: receipt.getString('target_record_id'),
            scaffoldedParentCount: 0,
            assetOutcomes: item.assets.map(asset => ({
              assetId: asset.assetId,
              outcome: 'already_applied',
            })),
          };
          return;
        }
        if (receipt.getString('state') !== 'scaffold') {
          throw new ApiError(409, 'Archive item is already being restored.', {
            reason: new ValidationError(
              'restore_item_busy',
              'The archive item is already being restored.'
            ),
          });
        }
        if (
          !findOwned(receipt.getString('target_collection'), receipt.getString('target_record_id'))
        ) {
          throw targetDeletedError();
        }
      }

      let target = null;
      let collection = '';
      let targetField = '';
      if (item.kind === 'diamond-project') {
        collection = 'projects';
        target = createProject(item);
      } else if (item.kind === 'coloring-book') {
        collection = 'coloring_books';
        target = createBook(item);
      } else if (item.kind === 'coloring-medium') {
        const m = item.metadata;
        if (typeof m.name !== 'string' || !m.name.trim() || typeof m.type !== 'string') {
          throw new BadRequestError('Invalid coloring medium metadata.');
        }
        collection = 'coloring_mediums';
        const id = deterministicId(item.itemId);
        target = findOwned(collection, id);
        if (!target) {
          target = new Record(txApp.findCollectionByNameOrId(collection));
          target.set('id', id);
          target.set('user', authId);
          target.set('name', m.name.trim());
          target.set('type', m.type);
          target.set('brand', m.brand || '');
          target.set('color_count', m.colorCount || 0);
          target.set('notes', m.notes || '');
          txApp.saveWithContext(context, target);
        }
      } else if (item.kind === 'coloring-page') {
        if (!item.parent || item.parent.kind !== 'coloring-book') {
          throw new BadRequestError('Coloring page is missing its book parent.');
        }
        target = ensureParent(
          {
            itemId: item.itemId,
            kind: item.kind,
            parent: item.parent,
            metadata: item.metadata,
            digest: descriptorDigest(item),
          },
          false
        );
        collection = 'coloring_pages';
      } else if (item.kind === 'diamond-project-note') {
        if (!item.parent || item.parent.kind !== 'diamond-project') {
          throw new BadRequestError('Project note is missing its project parent.');
        }
        const parent = ensureParent(item.parent);
        const m = item.metadata;
        if (typeof m.content !== 'string' || typeof m.date !== 'string') {
          throw new BadRequestError('Invalid project note metadata.');
        }
        collection = 'progress_notes';
        const id = deterministicId(item.itemId);
        target = findOwned(collection, id);
        if (!target) {
          target = new Record(txApp.findCollectionByNameOrId(collection));
          target.set('id', id);
          target.set('project', parent.id);
          target.set('content', m.content);
          target.set('date', m.date);
          txApp.saveWithContext(context, target);
        }
      } else if (item.kind === 'coloring-page-note') {
        if (!item.parent || item.parent.kind !== 'coloring-page') {
          throw new BadRequestError('Page note is missing its page parent.');
        }
        const parent = ensureParent(item.parent);
        const m = item.metadata;
        if (typeof m.content !== 'string' || typeof m.date !== 'string') {
          throw new BadRequestError('Invalid page note metadata.');
        }
        collection = 'coloring_page_progress_notes';
        const id = deterministicId(item.itemId);
        target = findOwned(collection, id);
        if (!target) {
          target = new Record(txApp.findCollectionByNameOrId(collection));
          target.set('id', id);
          target.set('user', authId);
          target.set('page', parent.id);
          target.set('content', m.content);
          target.set('date', m.date);
          txApp.saveWithContext(context, target);
        }
      } else if (item.kind === 'coloring-color-reference') {
        if (!item.parent || item.parent.kind !== 'coloring-page') {
          throw new BadRequestError('Color reference is missing its page parent.');
        }
        const parent = ensureParent(item.parent);
        if (typeof item.metadata.notes !== 'string' || item.metadata.notes.length > 100000) {
          throw new BadRequestError('Invalid color reference metadata.');
        }
        collection = 'coloring_page_color_references';
        const id = deterministicId(item.itemId);
        target = findOwned(collection, id);
        if (!target) {
          target = new Record(txApp.findCollectionByNameOrId(collection));
          target.set('id', id);
          target.set('user', authId);
          target.set('page', parent.id);
          target.set('notes', item.metadata.notes);
          target.set('restore_key', $security.sha256(request.backupId + ':' + item.itemId));
          txApp.saveWithContext(context, target);
        }
      } else if (item.kind === 'asset') {
        if (
          !item.parent ||
          !Number.isSafeInteger(item.metadata.position) ||
          item.metadata.position < 0
        ) {
          throw new BadRequestError('Invalid archive photo metadata.');
        }
        const parent = ensureParent(item.parent);
        const asset = item.assets[0];
        if (asset.role === 'coloring-page-photo' && item.parent.kind === 'coloring-page') {
          collection = 'coloring_pages';
          target = parent;
          targetField = 'photos';
        } else if (asset.role === 'coloring-swatch-photo' && item.parent.kind === 'coloring-page') {
          if (!isId(item.metadata.ownerItemId)) {
            throw new BadRequestError('Swatch photo is missing its color reference identity.');
          }
          collection = 'coloring_page_color_references';
          target = findOwned(collection, deterministicId(item.metadata.ownerItemId));
          if (!target || target.getString('page') !== parent.id) {
            throw new ApiError(409, 'Restore the color reference notes before its photos.');
          }
          targetField = 'photos';
        } else {
          throw new BadRequestError('Photo role does not match its parent.');
        }
      } else {
        throw new BadRequestError('Unsupported archive item.');
      }

      if (item.assets.length) {
        const asset = item.assets[0];
        const expected = {
          'diamond-project': { role: 'project-cover', field: 'image' },
          'diamond-project-note': {
            role: 'project-progress-note',
            field: 'image',
          },
          'coloring-book': {
            role: 'coloring-book-cover',
            field: 'cover_image',
          },
          'coloring-page-note': {
            role: 'coloring-page-progress-note',
            field: 'image',
          },
        }[item.kind];
        if (item.kind !== 'asset') {
          if (!expected || asset.role !== expected.role || asset.field !== expected.field) {
            throw new BadRequestError('Archive asset role does not match its record.');
          }
          targetField = expected.field;
        } else if (asset.field !== targetField) {
          throw new BadRequestError('Archive photo field does not match its role.');
        }
        if (
          (item.kind === 'diamond-project' || item.kind === 'coloring-book') &&
          target.getString(targetField)
        ) {
          throw new ApiError(409, 'The target already has a cover image.', {
            reason: new ValidationError(
              'archive_target_file_conflict',
              'The target cover image was changed after its scaffold was created.'
            ),
          });
        }
        target.set(targetField + (targetField === 'photos' ? '+' : ''), [
          uploadedById[asset.assetId],
        ]);
        txApp.saveWithContext(context, target);
      }
      receipt = saveReceipt(
        item,
        'complete',
        collection,
        target.id,
        targetField,
        item.assets.length ? uploadedById[item.assets[0].assetId].name : ''
      );
      if (targetField === 'photos') {
        const live = target.getStringSlice('photos');
        const rows = [];
        // A page holds at most 100 photos, but completed receipts can outlive
        // files the user later removes from the gallery.
        for (let offset = 0; ; offset += 100) {
          const batch = txApp.findRecordsByFilter(
            'archive_restore_items',
            "user = {:user} && backup_id = {:backup} && target_collection = {:collection} && target_record_id = {:record} && target_field = 'photos' && state = 'complete'",
            'id',
            100,
            offset,
            { user: authId, backup: request.backupId, collection, record: target.id }
          );
          rows.push(...batch);
          if (batch.length < 100) break;
        }
        const previousLive = live.filter(name => name !== receipt.getString('stored_filename'));
        const previousRestored = rows
          .filter(
            row =>
              row.id !== receipt.id && previousLive.indexOf(row.getString('stored_filename')) !== -1
          )
          .sort(
            (a, b) =>
              a.getInt('asset_position') - b.getInt('asset_position') ||
              a.getString('item_id').localeCompare(b.getString('item_id'))
          )
          .map(row => row.getString('stored_filename'));
        const previousUserFiles = previousLive.filter(
          name => previousRestored.indexOf(name) === -1
        );
        const baseline = previousRestored.concat(previousUserFiles);
        const userChangedOrder = baseline.some((name, index) => name !== previousLive[index]);
        const restored = rows
          .filter(row => live.indexOf(row.getString('stored_filename')) !== -1)
          .sort(
            (a, b) =>
              a.getInt('asset_position') - b.getInt('asset_position') ||
              a.getString('item_id').localeCompare(b.getString('item_id'))
          )
          .map(row => row.getString('stored_filename'));
        const userFiles = live.filter(name => restored.indexOf(name) === -1);
        const ordered = restored.concat(userFiles);
        if (!userChangedOrder && ordered.some((name, index) => name !== live[index])) {
          target.set('photos', ordered);
          txApp.saveWithContext(context, target);
        }
      }
      response = {
        outcome: 'created',
        itemId: item.itemId,
        targetRecordId: target.id,
        scaffoldedParentCount,
        assetOutcomes: item.assets.map(asset => ({
          assetId: asset.assetId,
          outcome: 'created',
        })),
      };
    });
    return e.json(200, response);
  },
  $apis.requireAuth('users'),
  $apis.bodyLimit(52 * 1024 * 1024)
);
