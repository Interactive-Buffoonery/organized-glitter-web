/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  'GET',
  '/api/mobile/sync/snapshot',
  e => {
    e.response.header().set('Cache-Control', 'private, no-store');
    if (!e.auth.getBool('verified')) throw new ForbiddenError('Email verification is required.');
    const owner = e.auth.getString('id');
    const maxRecords = 10000;
    const maxBytes = 16 * 1024 * 1024;
    const response = {
      version: 1,
      projects: [],
      coloringBooks: [],
      coloringPages: [],
      progressNotes: [],
      coloringPageProgressNotes: [],
    };
    const utf8Bytes = value => {
      let bytes = 0;
      for (const character of value) {
        const point = character.codePointAt(0);
        bytes += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
      }
      return bytes;
    };
    let responseBytes = utf8Bytes(JSON.stringify(response));
    const plans = [
      ['projects', 'projects', 'user = {:owner}'],
      ['coloringBooks', 'coloring_books', 'user = {:owner}'],
      ['coloringPages', 'coloring_pages', 'book.user = {:owner}'],
      ['progressNotes', 'progress_notes', 'project.user = {:owner}'],
      [
        'coloringPageProgressNotes',
        'coloring_page_progress_notes',
        'user = {:owner} && page.book.user = {:owner}',
      ],
    ];
    const fields = {
      projects: [
        'id',
        'collectionId',
        'collectionName',
        'created',
        'updated',
        'user',
        'title',
        'company',
        'artist',
        'status',
        'kit_category',
        'drill_shape',
        'source_url',
        'general_notes',
        'date_purchased',
        'date_started',
        'date_completed',
        'date_received',
        'width',
        'height',
        'total_diamonds',
        'color_count',
        'image',
      ],
      coloring_books: [
        'id',
        'collectionId',
        'collectionName',
        'created',
        'updated',
        'user',
        'title',
        'series',
        'theme',
        'isbn',
        'is_mystery',
        'status',
        'total_pages',
        'cover_image',
        'publisher',
        'illustrator',
        'completed_pages',
        'completion_percentage',
        'last_activity_at',
        'source_url',
        'notes',
        'edition',
        'date_purchased',
        'date_received',
        'date_started',
        'date_completed',
        'publication_year',
        'book_format',
        'language',
      ],
      coloring_pages: [
        'id',
        'collectionId',
        'collectionName',
        'created',
        'updated',
        'book',
        'page_number',
        'status',
        'photos',
        'revealed_subject',
        'revealed_at',
        'completed_at',
        'mediums',
        'started_at',
      ],
      progress_notes: [
        'id',
        'collectionId',
        'collectionName',
        'created',
        'updated',
        'project',
        'content',
        'date',
        'image',
      ],
      coloring_page_progress_notes: [
        'id',
        'collectionId',
        'collectionName',
        'created',
        'updated',
        'user',
        'page',
        'content',
        'date',
        'image',
      ],
    };
    let oversized = false;
    e.app.runInTransaction(txApp => {
      let count = 0;
      const labels = {};
      const taxonomy = [
        'companies',
        'artists',
        'book_publishers',
        'book_illustrators',
        'tags',
        'coloring_tags',
        'coloring_mediums',
      ];
      for (let t = 0; t < taxonomy.length; t += 1) {
        const collection = taxonomy[t];
        const records = txApp.findRecordsByFilter(
          collection,
          'user = {:owner}',
          'id',
          maxRecords - count + 1,
          0,
          { owner }
        );
        count += records.length;
        if (count > maxRecords) {
          oversized = true;
          return;
        }
        labels[collection] = {};
        for (let i = 0; i < records.length; i += 1) {
          const source = records[i].publicExport();
          const label = { id: source.id, name: source.name };
          if (collection === 'tags' || collection === 'coloring_tags') {
            label.slug = source.slug;
            label.color = source.color;
          }
          labels[collection][source.id] = label;
        }
      }
      const joins = {};
      const joinPlans = [
        [
          'project_tags',
          'project',
          'tag',
          'tags',
          'project.user = {:owner} && tag.user = {:owner}',
        ],
        [
          'coloring_book_tags',
          'book',
          'tag',
          'coloring_tags',
          'book.user = {:owner} && tag.user = {:owner}',
        ],
      ];
      for (let j = 0; j < joinPlans.length; j += 1) {
        const [collection, parentField, relationField, relationCollection, filter] = joinPlans[j];
        joins[collection] = {};
        const records = txApp.findRecordsByFilter(
          collection,
          filter,
          'id',
          maxRecords - count + 1,
          0,
          { owner }
        );
        count += records.length;
        if (count > maxRecords) {
          oversized = true;
          return;
        }
        for (let i = 0; i < records.length; i += 1) {
          const source = records[i].publicExport();
          const label = labels[relationCollection][source[relationField]];
          if (!label) continue;
          const parentId = source[parentField];
          if (!joins[collection][parentId]) joins[collection][parentId] = [];
          joins[collection][parentId].push({
            id: source.id,
            [parentField]: parentId,
            [relationField]: source[relationField],
            expand: { [relationField]: label },
          });
        }
      }
      const booksById = {};
      for (let p = 0; p < plans.length; p += 1) {
        const [key, collection, filter] = plans[p];
        const records = txApp.findRecordsByFilter(
          collection,
          filter,
          'id',
          maxRecords - count + 1,
          0,
          { owner }
        );
        count += records.length;
        if (count > maxRecords) {
          oversized = true;
          return;
        }
        const allowed = fields[collection];
        for (let i = 0; i < records.length; i += 1) {
          const source = records[i].publicExport();
          const item = {};
          for (let j = 0; j < allowed.length; j += 1) {
            const name = allowed[j];
            if (Object.prototype.hasOwnProperty.call(source, name)) item[name] = source[name];
          }
          const expand = {};
          if (collection === 'projects') {
            if (labels.companies[item.company]) expand.company = labels.companies[item.company];
            if (labels.artists[item.artist]) expand.artist = labels.artists[item.artist];
            expand.project_tags_via_project = joins.project_tags[item.id] || [];
          } else if (collection === 'coloring_books') {
            if (labels.book_publishers[item.publisher])
              expand.publisher = labels.book_publishers[item.publisher];
            if (labels.book_illustrators[item.illustrator])
              expand.illustrator = labels.book_illustrators[item.illustrator];
            expand.coloring_book_tags_via_book = joins.coloring_book_tags[item.id] || [];
            booksById[item.id] = { id: item.id, title: item.title, user: item.user };
          } else if (collection === 'coloring_pages') {
            if (booksById[item.book]) expand.book = booksById[item.book];
            const mediumIds = Array.isArray(item.mediums) ? item.mediums : [];
            expand.mediums = mediumIds.map(id => labels.coloring_mediums[id]).filter(Boolean);
          }
          if (Object.keys(expand).length) item.expand = expand;
          responseBytes += utf8Bytes(JSON.stringify(item)) + (response[key].length ? 1 : 0);
          if (responseBytes > maxBytes) {
            oversized = true;
            return;
          }
          response[key].push(item);
        }
      }
    });
    if (oversized) return e.json(413, { reason: 'snapshot_too_large' });
    return e.json(200, response);
  },
  $apis.requireAuth('users')
);

routerAdd(
  'POST',
  '/api/mobile/sync/apply',
  e => {
    e.response.header().set('Cache-Control', 'private, no-store');
    if (!e.auth.getBool('verified')) throw new ForbiddenError('Email verification is required.');
    const body = e.requestInfo().body;
    const allowed = {
      projects: [
        'title',
        'status',
        'kit_category',
        'drill_shape',
        'source_url',
        'general_notes',
        'date_purchased',
        'date_started',
        'date_completed',
        'date_received',
        'width',
        'height',
        'total_diamonds',
        'color_count',
        'company',
        'artist',
      ],
      coloring_books: [
        'title',
        'series',
        'theme',
        'isbn',
        'is_mystery',
        'status',
        'source_url',
        'notes',
        'edition',
        'date_purchased',
        'date_received',
        'date_started',
        'date_completed',
        'publication_year',
        'book_format',
        'language',
        'publisher',
        'illustrator',
      ],
      coloring_pages: [
        'status',
        'revealed_subject',
        'revealed_at',
        'started_at',
        'completed_at',
        'mediums',
      ],
    };
    const dates = {
      projects: ['status', 'date_started', 'date_completed'],
      coloring_books: ['status', 'date_started', 'date_completed'],
      coloring_pages: ['status', 'started_at', 'completed_at', 'revealed_at', 'revealed_subject'],
    };
    const plain = value => value && typeof value === 'object' && !Array.isArray(value);
    const base = body && plain(body.base) ? body.base : null;
    const patch = body && plain(body.patch) ? body.patch : null;
    if (
      !body ||
      Object.keys(body).some(
        key => !['operationId', 'collection', 'recordId', 'base', 'patch'].includes(key)
      ) ||
      !/^[A-Za-z0-9_-]{8,100}$/.test(body.operationId) ||
      !Object.prototype.hasOwnProperty.call(allowed, body.collection) ||
      !/^[a-z0-9]{15}$/.test(body.recordId) ||
      !base ||
      !patch
    ) {
      throw new BadRequestError('Invalid mobile sync operation.');
    }
    const sourcePatch = patch;
    const patchKeys = Object.keys(sourcePatch).sort();
    if (patchKeys.length < 1 || patchKeys.length > 20)
      throw new BadRequestError('Invalid mobile sync fields.');
    const sourceBase = base;
    const checks = {};
    for (let i = 0; i < patchKeys.length; i += 1) {
      const key = patchKeys[i];
      if (!allowed[body.collection].includes(key))
        throw new BadRequestError('Field is not available for mobile sync.');
      checks[key] = true;
    }
    if (patchKeys.some(key => dates[body.collection].includes(key))) {
      for (let i = 0; i < dates[body.collection].length; i += 1)
        checks[dates[body.collection][i]] = true;
    }
    const checkKeys = Object.keys(checks).sort();
    const canonicalBase = {};
    const canonicalPatch = {};
    const isValue = value =>
      value === null ||
      typeof value === 'string' ||
      (typeof value === 'number' && Number.isFinite(value)) ||
      typeof value === 'boolean' ||
      (Array.isArray(value) &&
        value.length <= 100 &&
        value.every(v => typeof v === 'string' && /^[a-z0-9]{15}$/.test(v)));
    for (let i = 0; i < checkKeys.length; i += 1) {
      const key = checkKeys[i];
      if (!Object.prototype.hasOwnProperty.call(sourceBase, key) || !isValue(sourceBase[key]))
        throw new BadRequestError('Missing or invalid base field.');
      canonicalBase[key] = sourceBase[key];
    }
    for (let i = 0; i < patchKeys.length; i += 1) {
      const key = patchKeys[i];
      if (!isValue(sourcePatch[key])) throw new BadRequestError('Invalid patch field.');
      canonicalPatch[key] = sourcePatch[key];
    }
    const payload = JSON.stringify([body.collection, body.recordId, canonicalBase, canonicalPatch]);
    if (payload.length > 32768) throw new BadRequestError('Mobile sync operation is too large.');
    const owner = e.auth.getString('id');
    const digest = $security.sha256(payload);
    let result = null;
    let conflict = null;
    e.app.runInTransaction(txApp => {
      let record = null;
      try {
        record = txApp.findRecordById(body.collection, body.recordId);
      } catch (_err) {
        return;
      }
      let recordOwner = '';
      try {
        recordOwner =
          body.collection === 'coloring_pages'
            ? txApp.findRecordById('coloring_books', record.getString('book')).getString('user')
            : record.getString('user');
      } catch (_err) {
        return;
      }
      if (recordOwner !== owner) return;
      const getOwnedLabel = (collection, id, titleField) => {
        if (!id) return null;
        try {
          const related = txApp.findRecordById(collection, id);
          if (related.getString('user') !== owner) return null;
          const label = { id, [titleField]: related.getString(titleField) };
          if (collection === 'tags' || collection === 'coloring_tags') {
            label.slug = related.getString('slug');
            label.color = related.getString('color');
          }
          return label;
        } catch (_err) {
          return null;
        }
      };
      const getOwnedTags = collection => {
        const rows = txApp.findRecordsByFilter(collection, 'user = {:owner}', 'id', 10001, 0, {
          owner,
        });
        if (rows.length > 10000) throw new ApiError(413, 'Too many tags.');
        const tags = {};
        for (let i = 0; i < rows.length; i += 1) {
          const source = rows[i].publicExport();
          tags[source.id] = {
            id: source.id,
            name: source.name,
            slug: source.slug,
            color: source.color,
          };
        }
        return tags;
      };
      const decorate = raw => {
        const item = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(JSON.stringify(raw));
        const expand = {};
        if (body.collection === 'projects') {
          const company = getOwnedLabel('companies', item.company, 'name');
          const artist = getOwnedLabel('artists', item.artist, 'name');
          if (company) expand.company = company;
          if (artist) expand.artist = artist;
          const tags = txApp.findRecordsByFilter(
            'project_tags',
            'project = {:id} && project.user = {:owner} && tag.user = {:owner}',
            'id',
            10001,
            0,
            { id: item.id, owner }
          );
          if (tags.length > 10000) throw new ApiError(413, 'Too many project tags.');
          const ownedTags = getOwnedTags('tags');
          expand.project_tags_via_project = tags
            .map(join => {
              const tag = ownedTags[join.getString('tag')];
              return tag
                ? { id: join.getString('id'), project: item.id, tag: tag.id, expand: { tag } }
                : null;
            })
            .filter(Boolean);
        } else if (body.collection === 'coloring_books') {
          const publisher = getOwnedLabel('book_publishers', item.publisher, 'name');
          const illustrator = getOwnedLabel('book_illustrators', item.illustrator, 'name');
          if (publisher) expand.publisher = publisher;
          if (illustrator) expand.illustrator = illustrator;
          const tags = txApp.findRecordsByFilter(
            'coloring_book_tags',
            'book = {:id} && book.user = {:owner} && tag.user = {:owner}',
            'id',
            10001,
            0,
            { id: item.id, owner }
          );
          if (tags.length > 10000) throw new ApiError(413, 'Too many coloring book tags.');
          const ownedTags = getOwnedTags('coloring_tags');
          expand.coloring_book_tags_via_book = tags
            .map(join => {
              const tag = ownedTags[join.getString('tag')];
              return tag
                ? { id: join.getString('id'), book: item.id, tag: tag.id, expand: { tag } }
                : null;
            })
            .filter(Boolean);
        } else {
          const book = txApp.findRecordById('coloring_books', item.book);
          if (book.getString('user') === owner)
            expand.book = { id: book.getString('id'), title: book.getString('title'), user: owner };
          const mediumIds = Array.isArray(item.mediums) ? item.mediums : [];
          expand.mediums = mediumIds
            .map(id => getOwnedLabel('coloring_mediums', id, 'name'))
            .filter(Boolean);
        }
        item.expand = expand;
        return item;
      };
      const receipts = txApp.findRecordsByFilter(
        'mobile_sync_receipts',
        'user = {:owner} && operation_id = {:operationId}',
        '',
        1,
        0,
        { owner, operationId: body.operationId }
      );
      const receipt = receipts[0];
      if (receipt) {
        if (receipt.getString('user') !== owner || receipt.getString('request_hash') !== digest) {
          conflict = { reason: 'operation_id_reused' };
          return;
        }
        result = { outcome: 'replayed', record: decorate(record.publicExport()) };
        return;
      }
      const current = record.publicExport();
      for (let i = 0; i < checkKeys.length; i += 1) {
        const key = checkKeys[i];
        const expected = canonicalBase[key];
        const stored = current[key];
        const emptyStored =
          stored === '' ||
          stored === 0 ||
          stored === false ||
          (Array.isArray(stored) && stored.length === 0);
        if (
          !(expected === null && emptyStored) &&
          JSON.stringify(stored) !== JSON.stringify(expected)
        ) {
          conflict = { reason: 'field_conflict', record: decorate(current) };
          return;
        }
      }
      const relations = {
        company: 'companies',
        artist: 'artists',
        publisher: 'book_publishers',
        illustrator: 'book_illustrators',
        mediums: 'coloring_mediums',
      };
      for (let i = 0; i < patchKeys.length; i += 1) {
        const key = patchKeys[i];
        if (!relations[key]) continue;
        const ids = Array.isArray(canonicalPatch[key])
          ? canonicalPatch[key]
          : canonicalPatch[key]
            ? [canonicalPatch[key]]
            : [];
        for (let j = 0; j < ids.length; j += 1) {
          let related = null;
          try {
            related = txApp.findRecordById(relations[key], ids[j]);
          } catch (_err) {
            throw new BadRequestError('Invalid relation.');
          }
          if (related.getString('user') !== owner) throw new BadRequestError('Invalid relation.');
        }
      }
      for (let i = 0; i < patchKeys.length; i += 1)
        record.set(patchKeys[i], canonicalPatch[patchKeys[i]]);
      txApp.save(record);
      const saved = txApp.findRecordById(body.collection, body.recordId).publicExport();
      const receiptCollection = txApp.findCollectionByNameOrId('mobile_sync_receipts');
      const created = new Record(receiptCollection);
      created.set('user', owner);
      created.set('operation_id', body.operationId);
      created.set('request_hash', digest);
      txApp.save(created);
      result = { outcome: 'updated', record: decorate(saved) };
    });
    if (conflict) return e.json(409, conflict);
    if (!result) throw new NotFoundError('Record not found.');
    return e.json(200, result);
  },
  $apis.requireAuth('users'),
  $apis.bodyLimit(32768)
);
