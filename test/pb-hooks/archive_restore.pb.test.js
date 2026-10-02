import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

class MockRecord {
  constructor(collectionOrData = {}) {
    this.collection = collectionOrData?.name ? collectionOrData : null;
    this.data = collectionOrData?.name ? {} : structuredClone(collectionOrData);
  }

  get id() {
    return String(this.data.id ?? '');
  }

  get(fieldName) {
    return this.data[fieldName];
  }

  getBool(fieldName) {
    return Boolean(this.data[fieldName]);
  }

  getDateTime(fieldName) {
    return { string: () => String(this.data[fieldName] ?? '') };
  }

  getInt(fieldName) {
    return Number(this.data[fieldName] ?? 0);
  }

  getString(fieldName) {
    const value = this.data[fieldName];
    return value === null || value === undefined ? '' : String(value);
  }

  getStringSlice(fieldName) {
    const value = this.data[fieldName];
    return Array.isArray(value) ? [...value] : [];
  }

  set(fieldName, value) {
    this.data[fieldName] = value;
  }
}

class MockDynamicModel {
  constructor(defaults = {}) {
    Object.assign(this, defaults);
  }
}

class MockContext {
  constructor(parent = null, key = '', value = undefined) {
    this.parent = parent;
    this.key = key;
    this.storedValue = value;
  }

  value(key) {
    if (key === this.key) return this.storedValue;
    return this.parent?.value?.(key);
  }
}

class MockApiError extends Error {
  constructor(status, message, data = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

class MockBadRequestError extends MockApiError {
  constructor(message, data = {}) {
    super(400, message, data);
  }
}

class MockForbiddenError extends MockApiError {
  constructor(message, data = {}) {
    super(403, message, data);
  }
}

function cloneCollections(collections) {
  const cloned = {};
  for (const [collectionName, records] of Object.entries(collections)) {
    cloned[collectionName] = new Map(
      Array.from(records.entries(), ([id, record]) => {
        const clonedRecord = new MockRecord({ name: collectionName });
        clonedRecord.data = { ...structuredClone(record.data), id };
        return [id, clonedRecord];
      })
    );
  }
  return cloned;
}

function makeApp(initial = {}, options = {}) {
  const state = {
    collections: cloneCollections({
      coloring_books: new Map(),
      coloring_pages: new Map(),
      coloring_mediums: new Map(),
      book_publishers: new Map(),
      book_illustrators: new Map(),
      ...Object.fromEntries(
        Object.entries(initial).map(([collectionName, records]) => [
          collectionName,
          new Map(
            records.map(record => [
              record.id,
              record instanceof MockRecord ? record : new MockRecord(record),
            ])
          ),
        ])
      ),
    }),
  };
  let generatedId = 0;
  let saveCount = 0;

  const createApi = getCollections => ({
    db: () => ({
      newQuery: () => ({
        bind: ({ bookId, totalPages }) => ({
          one: model => {
            model.completedPages = Array.from(getCollections().coloring_pages.values()).filter(
              page =>
                page.getString('book') === bookId &&
                page.getInt('page_number') <= totalPages &&
                page.getString('status') === 'completed'
            ).length;
          },
        }),
      }),
    }),
    findCollectionByNameOrId: collectionName => ({ name: collectionName }),
    findRecordById: (collectionName, recordId) => {
      const record = getCollections()[collectionName]?.get(recordId);
      if (!record) throw new Error(`Record not found: ${collectionName}/${recordId}`);
      return record;
    },
    findRecordsByFilter: (_collectionName, _filter, _sort, limit, _offset, params) =>
      Array.from(getCollections().coloring_pages.values())
        .filter(
          page =>
            page.getString('book') === params.bookId &&
            page.getInt('page_number') >= params.firstPage &&
            page.getInt('page_number') <= params.lastPage
        )
        .sort((left, right) => left.getInt('page_number') - right.getInt('page_number'))
        .slice(0, limit),
    saveWithContext: (_context, record) => {
      saveCount += 1;
      const collectionName = record.collection?.name;
      if (!collectionName) throw new Error('Cannot save a record without a collection.');
      if (options.failSave?.({ collectionName, record, saveCount })) {
        throw new Error('Injected transaction save failure.');
      }
      if (!record.id) {
        generatedId += 1;
        record.set('id', `${collectionName}-${generatedId}`);
      }
      if (!record.getString('created')) record.set('created', '2026-09-05T12:00:00.000Z');
      if (!record.getString('updated')) record.set('updated', '2026-09-05T12:00:00.000Z');
      getCollections()[collectionName].set(record.id, record);
      options.afterSave?.({ collectionName, record, saveCount });
    },
  });

  const app = createApi(() => state.collections);
  app.runInTransaction = callback => {
    const workingCollections = cloneCollections(state.collections);
    const txApp = createApi(() => workingCollections);
    callback(txApp);
    state.collections = workingCollections;
  };
  app.getRecord = (collectionName, recordId) => state.collections[collectionName]?.get(recordId);
  app.listRecords = collectionName => Array.from(state.collections[collectionName]?.values() ?? []);
  return app;
}

function loadHook() {
  const routes = [];
  const requireAuth = vi.fn((...collections) => ({ collections }));
  const hookPath = resolve(process.cwd(), 'pb_hooks/archive_restore.pb.js');

  vm.runInNewContext(readFileSync(hookPath, 'utf8'), {
    ApiError: MockApiError,
    BadRequestError: MockBadRequestError,
    Context: MockContext,
    DynamicModel: MockDynamicModel,
    ForbiddenError: MockForbiddenError,
    Record: MockRecord,
    $apis: { requireAuth },
    $security: {
      sha256: value => createHash('sha256').update(value).digest('hex'),
    },
    routerAdd: (method, path, handler, middleware) =>
      routes.push({ method, path, handler, middleware }),
  });

  return { requireAuth, routes };
}

function getRoute(routes, path) {
  const route = routes.find(candidate => candidate.path === path);
  if (!route) throw new Error(`Missing route: ${path}`);
  return route;
}

function nestedModel(values) {
  return { get: fieldName => values[fieldName] };
}

function makeEvent(app, body, authId = 'owner-1', verified = true) {
  let response;
  return {
    app,
    auth: new MockRecord({ id: authId, verified }),
    bindBody: model => {
      for (const [key, value] of Object.entries(body)) {
        model[key] =
          (key === 'baseline' || key === 'intended') && value && typeof value === 'object'
            ? nestedModel(value)
            : value;
      }
    },
    findUploadedFiles: () => [],
    json: (status, payload) => {
      response = { status, payload };
      return response;
    },
    request: { context: () => new MockContext() },
    get response() {
      return response;
    },
  };
}

function bookIdFor(authId, archiveFingerprint, archiveBookRef) {
  return createHash('sha256')
    .update(`${authId}\0${archiveFingerprint}\0${archiveBookRef}`)
    .digest('hex')
    .slice(0, 15);
}

function bookRestoreBody(overrides = {}) {
  return {
    archiveFingerprint: 'a'.repeat(64),
    archiveBookRef: 'coloring-book:legacy',
    title: 'Legacy Book',
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
    status: 'in_stash',
    totalPages: 600,
    completedPages: 0,
    completionPercentage: 0,
    lastActivityAt: '',
    firstPage: 1,
    pageCount: 3,
    allowCreate: true,
    ...overrides,
  };
}

function metadataSnapshot(overrides = {}) {
  return {
    status: 'not_started',
    mediumIds: [],
    revealedSubject: '',
    revealedAt: '',
    startedAt: '',
    completedAt: '',
    updatedAt: '2026-09-05T12:00:00.000Z',
    ...overrides,
  };
}

describe('archive restore PocketBase routes', () => {
  it('requires users authentication for every archive route', () => {
    const { requireAuth, routes } = loadHook();

    expect(routes).toHaveLength(4);
    expect(requireAuth).toHaveBeenCalledTimes(4);
    expect(requireAuth.mock.calls).toEqual([['users'], ['users'], ['users'], ['users']]);
    expect(routes.every(route => route.middleware.collections[0] === 'users')).toBe(true);
  });

  it('rejects unverified users from every archive route', () => {
    const { routes } = loadHook();

    for (const route of routes) {
      expect(() => route.handler(makeEvent(null, {}, 'owner-1', false))).toThrow(
        'Email verification is required.'
      );
    }
  });

  it('rejects page metadata restore when the page belongs to another user', () => {
    const { routes } = loadHook();
    const app = makeApp({
      coloring_books: [{ id: 'book-1', user: 'owner-2' }],
      coloring_pages: [
        {
          id: 'page-1',
          book: 'book-1',
          ...metadataSnapshot(),
          mediums: [],
          updated: '2026-09-05T12:00:00.000Z',
        },
      ],
    });
    const event = makeEvent(app, {
      pageId: 'page-1',
      baseline: metadataSnapshot(),
      intended: metadataSnapshot({ status: 'completed' }),
    });

    expect(() =>
      getRoute(routes, '/api/archive/restore-coloring-page-metadata').handler(event)
    ).toThrow('not owned by the current user');
    expect(app.getRecord('coloring_pages', 'page-1').getString('status')).toBe('not_started');
  });

  it('rejects a foreign coloring medium without changing page metadata', () => {
    const { routes } = loadHook();
    const app = makeApp({
      coloring_books: [{ id: 'book-1', user: 'owner-1' }],
      coloring_pages: [
        {
          id: 'page-1',
          book: 'book-1',
          status: 'not_started',
          mediums: [],
          revealed_subject: '',
          revealed_at: '',
          started_at: '',
          completed_at: '',
          updated: '2026-09-05T12:00:00.000Z',
        },
      ],
      coloring_mediums: [{ id: 'medium-1', user: 'owner-2' }],
    });
    const event = makeEvent(app, {
      pageId: 'page-1',
      baseline: metadataSnapshot(),
      intended: metadataSnapshot({ mediumIds: ['medium-1'] }),
    });

    expect(() =>
      getRoute(routes, '/api/archive/restore-coloring-page-metadata').handler(event)
    ).toThrow('Invalid coloring medium');
    expect(app.getRecord('coloring_pages', 'page-1').getStringSlice('mediums')).toEqual([]);
  });

  it('reports a metadata conflict without overwriting an independent edit', () => {
    const { routes } = loadHook();
    const app = makeApp({
      coloring_books: [{ id: 'book-1', user: 'owner-1' }],
      coloring_pages: [
        {
          id: 'page-1',
          book: 'book-1',
          status: 'in_progress',
          mediums: [],
          revealed_subject: 'Independent edit',
          revealed_at: '',
          started_at: '',
          completed_at: '',
          updated: '2026-09-05T12:05:00.000Z',
        },
      ],
    });
    const event = makeEvent(app, {
      pageId: 'page-1',
      baseline: metadataSnapshot(),
      intended: metadataSnapshot({ status: 'completed' }),
    });

    let error;
    try {
      getRoute(routes, '/api/archive/restore-coloring-page-metadata').handler(event);
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({ status: 409, data: { reason: 'archive_restore_conflict' } });
    expect(app.getRecord('coloring_pages', 'page-1').data).toMatchObject({
      status: 'in_progress',
      revealed_subject: 'Independent edit',
    });
  });

  it('applies page metadata once and treats a retry as already applied', () => {
    const { routes } = loadHook();
    const app = makeApp({
      coloring_books: [{ id: 'book-1', user: 'owner-1' }],
      coloring_pages: [
        {
          id: 'page-1',
          book: 'book-1',
          status: 'not_started',
          mediums: [],
          revealed_subject: '',
          revealed_at: '',
          started_at: '',
          completed_at: '',
          updated: '2026-09-05T12:00:00.000Z',
        },
      ],
      coloring_mediums: [{ id: 'medium-1', user: 'owner-1' }],
    });
    const body = {
      pageId: 'page-1',
      baseline: metadataSnapshot(),
      intended: metadataSnapshot({ status: 'completed', mediumIds: ['medium-1'] }),
    };
    const route = getRoute(routes, '/api/archive/restore-coloring-page-metadata');
    const firstEvent = makeEvent(app, body);
    const retryEvent = makeEvent(app, body);

    route.handler(firstEvent);
    route.handler(retryEvent);

    expect(firstEvent.response).toEqual({ status: 200, payload: { outcome: 'updated' } });
    expect(retryEvent.response).toEqual({ status: 200, payload: { outcome: 'already_applied' } });
    expect(app.getRecord('coloring_pages', 'page-1').data).toMatchObject({
      status: 'completed',
      mediums: ['medium-1'],
    });
  });

  it('rejects an existing archive book with conflicting identity', () => {
    const { routes } = loadHook();
    const body = bookRestoreBody({ allowCreate: false });
    const bookId = bookIdFor('owner-1', body.archiveFingerprint, body.archiveBookRef);
    const app = makeApp({
      coloring_books: [
        { id: bookId, user: 'owner-1', title: 'Independently renamed', total_pages: 600 },
      ],
    });
    const event = makeEvent(app, body);

    expect(() => getRoute(routes, '/api/archive/restore-coloring-book').handler(event)).toThrow(
      'identity conflicts'
    );
    expect(app.listRecords('coloring_pages')).toHaveLength(0);
  });

  it('rejects an existing archive book owned by another user', () => {
    const { routes } = loadHook();
    const body = bookRestoreBody({ allowCreate: false });
    const bookId = bookIdFor('owner-1', body.archiveFingerprint, body.archiveBookRef);
    const app = makeApp({
      coloring_books: [{ id: bookId, user: 'owner-2', title: 'Legacy Book', total_pages: 600 }],
    });
    const event = makeEvent(app, body);

    expect(() => getRoute(routes, '/api/archive/restore-coloring-book').handler(event)).toThrow(
      'identity conflicts'
    );
    expect(app.listRecords('coloring_pages')).toHaveLength(0);
  });

  it('rejects a foreign publisher relation before creating the archive book', () => {
    const { routes } = loadHook();
    const body = bookRestoreBody({ publisher: 'publisher-1' });
    const app = makeApp({
      book_publishers: [{ id: 'publisher-1', user: 'owner-2' }],
    });
    const event = makeEvent(app, body);

    expect(() => getRoute(routes, '/api/archive/restore-coloring-book').handler(event)).toThrow(
      'Invalid archive coloring book relation'
    );
    expect(app.listRecords('coloring_books')).toHaveLength(0);
  });

  it('preserves existing page work while filling a bounded missing-page batch', () => {
    const { routes } = loadHook();
    const body = bookRestoreBody({ allowCreate: false, totalPages: 2, pageCount: 2 });
    const bookId = bookIdFor('owner-1', body.archiveFingerprint, body.archiveBookRef);
    const app = makeApp({
      coloring_books: [{ id: bookId, user: 'owner-1', title: 'Legacy Book', total_pages: 2 }],
      coloring_pages: [
        {
          id: 'existing-page',
          book: bookId,
          page_number: 1,
          status: 'completed',
          photos: ['photo.jpg'],
          mediums: [],
          revealed_subject: '',
          revealed_at: '',
          started_at: '',
          completed_at: '2026-09-05',
          created: '2026-09-05T12:00:00.000Z',
          updated: '2026-09-05T12:00:00.000Z',
        },
      ],
    });
    const event = makeEvent(app, body);

    getRoute(routes, '/api/archive/restore-coloring-book').handler(event);

    expect(event.response.payload.pages).toHaveLength(2);
    expect(event.response.payload.pages[0]).toMatchObject({
      id: 'existing-page',
      status: 'completed',
      photos: ['photo.jpg'],
    });
    expect(app.listRecords('coloring_pages')).toHaveLength(2);
  });

  it('accepts a continuation batch with identity fields and no repeated creation metadata', () => {
    const { routes } = loadHook();
    const fullBody = bookRestoreBody({ allowCreate: false, firstPage: 101, pageCount: 2 });
    const body = {
      archiveFingerprint: fullBody.archiveFingerprint,
      archiveBookRef: fullBody.archiveBookRef,
      title: fullBody.title,
      totalPages: fullBody.totalPages,
      firstPage: fullBody.firstPage,
      pageCount: fullBody.pageCount,
      allowCreate: fullBody.allowCreate,
    };
    const bookId = bookIdFor('owner-1', body.archiveFingerprint, body.archiveBookRef);
    const app = makeApp({
      coloring_books: [{ id: bookId, user: 'owner-1', title: 'Legacy Book', total_pages: 600 }],
    });
    const event = makeEvent(app, body);

    getRoute(routes, '/api/archive/restore-coloring-book').handler(event);

    expect(event.response).toMatchObject({ status: 200, payload: { bookId, created: false } });
    expect(event.response.payload.pages.map(page => page.pageNumber)).toEqual([101, 102]);
  });

  it('does not recreate a missing recovery target from a continuation batch', () => {
    const { routes } = loadHook();
    const fullBody = bookRestoreBody({ allowCreate: false, firstPage: 101, pageCount: 2 });
    const event = makeEvent(makeApp(), {
      archiveFingerprint: fullBody.archiveFingerprint,
      archiveBookRef: fullBody.archiveBookRef,
      title: fullBody.title,
      totalPages: fullBody.totalPages,
      firstPage: fullBody.firstPage,
      pageCount: fullBody.pageCount,
      allowCreate: false,
    });

    let error;
    try {
      getRoute(routes, '/api/archive/restore-coloring-book').handler(event);
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      status: 409,
      data: { reason: 'archive_recovery_target_missing' },
    });
    expect(event.app.listRecords('coloring_books')).toHaveLength(0);
    expect(event.app.listRecords('coloring_pages')).toHaveLength(0);
  });

  it('rolls back a partial book and page batch when a child save fails', () => {
    const { routes } = loadHook();
    const app = makeApp(
      {},
      {
        failSave: ({ collectionName, record }) =>
          collectionName === 'coloring_pages' && record.getInt('page_number') === 2,
      }
    );
    const event = makeEvent(app, bookRestoreBody());

    expect(() => getRoute(routes, '/api/archive/restore-coloring-book').handler(event)).toThrow(
      'Injected transaction save failure'
    );
    expect(app.listRecords('coloring_books')).toHaveLength(0);
    expect(app.listRecords('coloring_pages')).toHaveLength(0);
  });

  it('rejects metrics reconciliation for a book owned by another user', () => {
    const { routes } = loadHook();
    const app = makeApp({
      coloring_books: [{ id: 'book-1', user: 'owner-2', total_pages: 2 }],
    });
    const event = makeEvent(app, { bookId: 'book-1' });

    expect(() =>
      getRoute(routes, '/api/archive/reconcile-coloring-book-metrics').handler(event)
    ).toThrow('not owned by the current user');
  });

  it('reconciles metrics only from pages inside the stored total', () => {
    const { routes } = loadHook();
    const app = makeApp({
      coloring_books: [
        {
          id: 'book-1',
          user: 'owner-1',
          total_pages: 2,
          completed_pages: 0,
          completion_percentage: 0,
        },
      ],
      coloring_pages: [
        { id: 'page-1', book: 'book-1', page_number: 1, status: 'completed' },
        { id: 'page-2', book: 'book-1', page_number: 2, status: 'in_progress' },
        { id: 'page-3', book: 'book-1', page_number: 3, status: 'completed' },
      ],
    });
    const event = makeEvent(app, { bookId: 'book-1' });

    getRoute(routes, '/api/archive/reconcile-coloring-book-metrics').handler(event);

    expect(event.response).toEqual({
      status: 200,
      payload: { completedPages: 1, completionPercentage: 50 },
    });
    expect(app.getRecord('coloring_books', 'book-1').data).toMatchObject({
      completed_pages: 1,
      completion_percentage: 50,
    });
  });

  it('rolls back metrics when the saved values cannot be verified', () => {
    const { routes } = loadHook();
    const app = makeApp(
      {
        coloring_books: [
          {
            id: 'book-1',
            user: 'owner-1',
            total_pages: 2,
            completed_pages: 0,
            completion_percentage: 0,
          },
        ],
        coloring_pages: [{ id: 'page-1', book: 'book-1', page_number: 1, status: 'completed' }],
      },
      {
        afterSave: ({ collectionName, record }) => {
          if (collectionName === 'coloring_books') record.set('completed_pages', -1);
        },
      }
    );
    const event = makeEvent(app, { bookId: 'book-1' });

    expect(() =>
      getRoute(routes, '/api/archive/reconcile-coloring-book-metrics').handler(event)
    ).toThrow('did not persist exactly');
    expect(app.getRecord('coloring_books', 'book-1').data).toMatchObject({
      completed_pages: 0,
      completion_percentage: 0,
    });
  });
});
