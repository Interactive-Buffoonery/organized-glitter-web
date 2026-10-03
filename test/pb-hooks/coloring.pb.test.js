import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

class MockRecord {
  constructor(collectionOrData = {}) {
    this.collection = collectionOrData?.name ? collectionOrData : null;
    this.data = collectionOrData?.name ? {} : { ...collectionOrData };
    this.id = this.data.id ?? '';
    this.originalRecord = null;
  }

  get(fieldName) {
    return this.data[fieldName];
  }

  getBool(fieldName) {
    return Boolean(this.data[fieldName]);
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

  original() {
    return this.originalRecord;
  }

  set(fieldName, value) {
    this.data[fieldName] = value;
  }

  publicExport() {
    return { ...this.data, id: this.id };
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
  constructor(statusOrMessage, messageOrData = {}, data = {}) {
    const hasStatus = typeof statusOrMessage === 'number';
    super(hasStatus ? messageOrData : statusOrMessage);
    this.status = hasStatus ? statusOrMessage : 400;
    this.data = hasStatus ? data : messageOrData;
  }
}

class MockValidationError {
  constructor(code, message) {
    this.code = code;
    this.message = message;
  }
}

function loadHook() {
  const handlers = { create: [], update: [], requestUpdate: [], delete: [], routes: [] };
  const hookPath = resolve(process.cwd(), 'pb_hooks/coloring.pb.js');
  const code = readFileSync(hookPath, 'utf8');

  const module = { exports: {} };
  vm.runInNewContext(
    readFileSync(resolve(process.cwd(), 'pb_hooks/tag_revision_helpers.js'), 'utf8'),
    {
      module,
      ApiError: MockApiError,
      BadRequestError: MockApiError,
      Context: MockContext,
      DynamicModel: MockDynamicModel,
      Record: MockRecord,
    }
  );

  vm.runInNewContext(code, {
    require: () => module.exports,
    __hooks: '',
    ApiError: MockApiError,
    BadRequestError: MockApiError,
    Context: MockContext,
    DynamicModel: MockDynamicModel,
    ForbiddenError: MockApiError,
    Record: MockRecord,
    ValidationError: MockValidationError,
    $apis: { requireAuth: vi.fn(() => ({ name: 'requireAuth' })) },
    onRecordCreate: (handler, collection) => handlers.create.push({ handler, collection }),
    onRecordUpdate: (handler, collection) => handlers.update.push({ handler, collection }),
    onRecordUpdateRequest: (handler, collection) =>
      handlers.requestUpdate.push({ handler, collection }),
    onRecordDelete: (handler, collection) => handlers.delete.push({ handler, collection }),
    routerAdd: (method, path, handler, middleware) =>
      handlers.routes.push({ method, path, handler, middleware }),
  });

  return handlers;
}

function bookUpdateEvent({
  bookId = 'book-1',
  previousTotalPages,
  nextTotalPages,
  pages,
  reduction = { extraPages: 0, workedPages: 0 },
  completedPages = 0,
}) {
  const record = new MockRecord({ id: bookId, total_pages: nextTotalPages });
  record.originalRecord = new MockRecord({ id: bookId, total_pages: previousTotalPages });
  const savedPages = [];
  const deleted = [];
  const queryCalls = [];
  const app = {
    findCollectionByNameOrId: name => ({ name }),
    findRecordsByFilter: (_collection, filter, _sort, _limit, _offset, params) =>
      pages.filter(page => {
        const pageNumber = page.getInt('page_number');
        if (filter.includes('page_number >= 1')) {
          return pageNumber >= 1 && pageNumber <= params.nextTotalPages;
        }
        return pageNumber > params.nextTotalPages;
      }),
    db: () => ({
      newQuery: query => ({
        bind: params => ({
          one: model => {
            queryCalls.push({ query, params });
            Object.assign(
              model,
              query.includes('COUNT(*) AS extraPages') ? reduction : { completedPages }
            );
          },
        }),
      }),
    }),
    save: page => savedPages.push(page),
    deleteWithContext: (context, page) => deleted.push({ context, page }),
  };

  return {
    app,
    context: new MockContext(),
    deleted,
    next: vi.fn(),
    queryCalls,
    record,
    savedPages,
  };
}

function pageEvent({
  bookId = 'book-1',
  previousStatus = 'not_started',
  nextStatus = 'completed',
  metrics = { totalPages: 2, completedPages: 1 },
  context = new MockContext(),
} = {}) {
  const record = new MockRecord({ id: 'page-1', book: bookId, status: nextStatus });
  record.originalRecord = new MockRecord({
    id: 'page-1',
    book: bookId,
    status: previousStatus,
  });
  const book = new MockRecord({ id: bookId });
  const queryCalls = [];
  const savedBooks = [];
  const app = {
    findRecordById: (collection, id) => {
      if (collection === 'coloring_books' && id === bookId) return book;
      throw new Error(`Record not found: ${collection}/${id}`);
    },
    db: () => ({
      newQuery: query => ({
        bind: params => ({
          one: model => {
            queryCalls.push({ query, params });
            Object.assign(model, metrics);
          },
        }),
      }),
    }),
    save: recordToSave => savedBooks.push(recordToSave),
  };
  return { app, book, context, next: vi.fn(), queryCalls, record, savedBooks };
}

describe('coloring PocketBase hook page reconciliation', () => {
  it('rejects unverified users from every coloring route', () => {
    const handlers = loadHook();

    for (const route of handlers.routes) {
      expect(() =>
        route.handler({
          auth: new MockRecord({ id: 'user-1', verified: false }),
        })
      ).toThrow('Email verification is required.');
    }
  });

  it('reorders the server photo list without dropping a concurrent upload', () => {
    const handlers = loadHook();
    const page = new MockRecord({
      id: 'page-1',
      book: 'book-1',
      photos: ['main.jpg', 'detail.jpg', 'concurrent.jpg'],
    });
    const book = new MockRecord({ id: 'book-1', user: 'user-1' });
    const save = vi.fn();
    const txApp = {
      findRecordById: (collection, id) => {
        if (collection === 'coloring_pages' && id === page.id) return page;
        if (collection === 'coloring_books' && id === book.id) return book;
        throw new Error(`Record not found: ${collection}/${id}`);
      },
      save,
    };
    const app = { runInTransaction: vi.fn(callback => callback(txApp)) };
    const json = vi.fn((_status, body) => body);
    const event = {
      app,
      auth: new MockRecord({ id: 'user-1', verified: true }),
      bindBody: body => {
        body.filename = 'detail.jpg';
      },
      json,
      request: { pathValue: () => page.id },
    };
    const route = handlers.routes.find(
      ({ path }) => path === '/api/coloring/pages/{pageId}/main-photo'
    );

    expect(route).toBeDefined();
    const result = route.handler(event);

    expect(app.runInTransaction).toHaveBeenCalledTimes(1);
    expect(page.getStringSlice('photos')).toEqual(['detail.jpg', 'main.jpg', 'concurrent.jpg']);
    expect(save).toHaveBeenCalledWith(page);
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ id: 'page-1' }));
    expect(result.photos).toEqual(['detail.jpg', 'main.jpg', 'concurrent.jpg']);
  });

  it('rejects a stale main-photo target that was concurrently deleted', () => {
    const handlers = loadHook();
    const page = new MockRecord({
      id: 'page-1',
      book: 'book-1',
      photos: ['main.jpg', 'concurrent.jpg'],
    });
    const book = new MockRecord({ id: 'book-1', user: 'user-1' });
    const txApp = {
      findRecordById: (collection, id) => (collection === 'coloring_pages' ? page : book),
      save: vi.fn(),
    };
    const event = {
      app: { runInTransaction: callback => callback(txApp) },
      auth: new MockRecord({ id: 'user-1', verified: true }),
      bindBody: body => {
        body.filename = 'deleted.jpg';
      },
      json: vi.fn(),
      request: { pathValue: () => page.id },
    };
    const route = handlers.routes.find(
      ({ path }) => path === '/api/coloring/pages/{pageId}/main-photo'
    );

    expect(() => route.handler(event)).toThrow('Photo list changed. Refresh and try again.');
    expect(txApp.save).not.toHaveBeenCalled();
  });

  it('rejects main-photo changes for a page owned by another user', () => {
    const handlers = loadHook();
    const page = new MockRecord({ id: 'page-1', book: 'book-1', photos: ['main.jpg'] });
    const book = new MockRecord({ id: 'book-1', user: 'user-2' });
    const txApp = {
      findRecordById: (collection, id) => (collection === 'coloring_pages' ? page : book),
      save: vi.fn(),
    };
    const event = {
      app: { runInTransaction: callback => callback(txApp) },
      auth: new MockRecord({ id: 'user-1', verified: true }),
      bindBody: body => {
        body.filename = 'main.jpg';
      },
      json: vi.fn(),
      request: { pathValue: () => page.id },
    };
    const route = handlers.routes.find(
      ({ path }) => path === '/api/coloring/pages/{pageId}/main-photo'
    );

    expect(() => route.handler(event)).toThrow(
      'This coloring page is not owned by the current user.'
    );
    expect(txApp.save).not.toHaveBeenCalled();
  });

  it('runs direct coloring book updates inside a transaction and restores the request app', () => {
    const handlers = loadHook();
    const txApp = { name: 'transaction app' };
    const regularApp = {
      runInTransaction: vi.fn(callback => callback(txApp)),
    };
    const event = {
      app: regularApp,
      requestInfo: () => ({ headers: {}, body: {} }),
      next: vi.fn(() => {
        expect(event.app).toBe(txApp);
        throw new Error('injected cleanup failure');
      }),
    };

    const handler = handlers.requestUpdate.find(
      ({ collection }) => collection === 'coloring_books'
    )?.handler;

    expect(handler).toBeTypeOf('function');
    expect(() => handler(event)).toThrow('injected cleanup failure');
    expect(regularApp.runInTransaction).toHaveBeenCalledTimes(1);
    expect(event.app).toBe(regularApp);
  });

  it('creates missing generated pages when total_pages increases', () => {
    const handlers = loadHook();
    const pages = [1, 2, 3, 4].map(
      pageNumber => new MockRecord({ id: `page-${pageNumber}`, page_number: pageNumber })
    );
    const event = bookUpdateEvent({ previousTotalPages: 3, nextTotalPages: 5, pages });

    handlers.update.find(({ collection }) => collection === 'coloring_books').handler(event);

    expect(event.next).toHaveBeenCalledTimes(1);
    expect(event.savedPages).toHaveLength(1);
    expect(event.savedPages[0].data).toMatchObject({
      book: 'book-1',
      page_number: 5,
      status: 'not_started',
    });
    expect(event.record.data).toMatchObject({ completed_pages: 0, completion_percentage: 0 });
  });

  it('rejects a reduction before saving when any excluded page has work', () => {
    const handlers = loadHook();
    const event = bookUpdateEvent({
      previousTotalPages: 900,
      nextTotalPages: 400,
      pages: [],
      reduction: { extraPages: 500, workedPages: 1 },
    });

    expect(() =>
      handlers.update.find(({ collection }) => collection === 'coloring_books').handler(event)
    ).toThrow('would exclude worked pages');
    expect(event.next).not.toHaveBeenCalled();
    expect(event.deleted).toHaveLength(0);
    expect(event.queryCalls).toHaveLength(1);
    expect(event.queryCalls[0].query).toContain('coloring_page_progress_notes');
    expect(event.queryCalls[0].query).toContain("COALESCE(cp.photos, '')");
    expect(event.queryCalls[0].query).toContain("COALESCE(cp.mediums, '')");
  });

  it('rejects an unbounded direct reduction before saving', () => {
    const handlers = loadHook();
    const event = bookUpdateEvent({
      previousTotalPages: 1200,
      nextTotalPages: 100,
      pages: [],
      reduction: { extraPages: 1100, workedPages: 0 },
    });

    let error;
    try {
      handlers.update.find(({ collection }) => collection === 'coloring_books').handler(event);
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      status: 400,
      data: {
        total_pages: {
          code: 'validation_page_reduction_limit',
        },
      },
    });
    expect(event.next).not.toHaveBeenCalled();
    expect(event.deleted).toHaveLength(0);
    expect(event.savedPages).toHaveLength(0);
  });

  it('deletes a bounded untouched reduction with one summary query and no child rollups', () => {
    const handlers = loadHook();
    const pages = [4, 5, 6].map(
      pageNumber =>
        new MockRecord({
          id: `page-${pageNumber}`,
          page_number: pageNumber,
          status: 'not_started',
        })
    );
    const event = bookUpdateEvent({
      previousTotalPages: 6,
      nextTotalPages: 3,
      pages,
      reduction: { extraPages: 3, workedPages: 0 },
    });

    handlers.update.find(({ collection }) => collection === 'coloring_books').handler(event);

    expect(event.next).toHaveBeenCalledTimes(1);
    expect(event.deleted.map(({ page }) => page.id)).toEqual(['page-4', 'page-5', 'page-6']);
    expect(
      event.deleted.every(({ context }) =>
        context.value('organized_glitter_page_reduction_cleanup')
      )
    ).toBe(true);
    expect(event.queryCalls).toHaveLength(2);
    expect(
      event.queryCalls.filter(call => call.query.includes('COUNT(*) AS extraPages'))
    ).toHaveLength(1);
  });

  it('bypasses aggregate and parent saves for trusted reduction deletes', () => {
    const handlers = loadHook();
    const event = pageEvent({
      context: new MockContext(null, 'organized_glitter_page_reduction_cleanup', true),
    });

    handlers.delete.find(({ collection }) => collection === 'coloring_pages').handler(event);

    expect(event.next).toHaveBeenCalledTimes(1);
    expect(event.queryCalls).toHaveLength(0);
    expect(event.savedBooks).toHaveLength(0);
  });

  it('recalculates large book metrics when a page becomes completed', () => {
    const handlers = loadHook();
    const event = pageEvent({ metrics: { totalPages: 600, completedPages: 550 } });

    handlers.update.find(({ collection }) => collection === 'coloring_pages').handler(event);

    expect(event.next).toHaveBeenCalledTimes(1);
    expect(event.record.getString('completed_at')).toBe('');
    expect(event.queryCalls).toHaveLength(1);
    expect(event.queryCalls[0].query).toContain('AS completedPages');
    expect(event.savedBooks).toEqual([event.book]);
    expect(event.book.data.completion_percentage).toBe(92);
  });

  it('sets page status when a completion date is entered and preserves dates on status edits', () => {
    const handlers = loadHook();
    const update = handlers.update.find(
      ({ collection }) => collection === 'coloring_pages'
    ).handler;
    const dated = pageEvent({ nextStatus: 'not_started' });
    dated.record.set('completed_at', '2026-09-20');
    update(dated);
    expect(dated.record.getString('status')).toBe('completed');
    expect(dated.savedBooks).toEqual([dated.book]);

    const reopened = pageEvent({ previousStatus: 'completed', nextStatus: 'in_progress' });
    reopened.record.originalRecord.set('completed_at', '2026-09-20');
    reopened.record.set('completed_at', '2026-09-20');
    update(reopened);
    expect(reopened.record.getString('status')).toBe('in_progress');
    expect(reopened.record.getString('completed_at')).toBe('2026-09-20');
    expect(reopened.record.getString('started_at')).toBe('');
  });

  it('recalculates book metrics when a normal page delete occurs', () => {
    const handlers = loadHook();
    const event = pageEvent();

    handlers.delete.find(({ collection }) => collection === 'coloring_pages').handler(event);

    expect(event.next).toHaveBeenCalledTimes(1);
    expect(event.queryCalls).toHaveLength(1);
    expect(event.savedBooks).toEqual([event.book]);
  });
});
