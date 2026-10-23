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
});
