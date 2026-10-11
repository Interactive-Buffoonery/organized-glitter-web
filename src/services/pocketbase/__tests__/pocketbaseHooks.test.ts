import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

const hookPath = (fileName: string) => join(process.cwd(), 'pb_hooks', fileName);
const readHook = (fileName: string) => readFileSync(hookPath(fileName), 'utf8');
const readMigration = (fileName: string) =>
  readFileSync(join(process.cwd(), 'pb_migrations', fileName), 'utf8');
const readHookFiles = () =>
  readdirSync(join(process.cwd(), 'pb_hooks'))
    .filter(fileName => fileName.endsWith('.pb.js'))
    .sort();
type CollectionRuleSnapshot = {
  name: string;
  authRule?: string | null;
  listRule: string | null;
  viewRule: string | null;
  createRule: string | null;
  updateRule: string | null;
  deleteRule: string | null;
};
const readSchema = () =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'docs/pocketbase/collections.schema.json'), 'utf8')
  ) as CollectionRuleSnapshot[];
const readCollection = (name: string) => {
  return readSchema().find(collection => collection.name === name);
};

const productionHookFiles = [
  'account_deletion_integrity.pb.js',
  'archive_restore.pb.js',
  'auth_sign_in_methods.pb.js',
  'coloring.pb.js',
  'coloring_medium_ownership.pb.js',
  'create_indexes.pb.js',
  'feedback.pb.js',
  'dashboard_settings.pb.js',
  'record_revision.pb.js',
  'relation_ownership.pb.js',
  'sort_proxy_sync.pb.js',
  'stats.pb.js',
  'taxonomy_deletion_guard.pb.js',
] as const;

const customRouteHookFiles = [
  'archive_restore.pb.js',
  'color_references.pb.js',
  'coloring.pb.js',
  'feedback.pb.js',
  'latest_notes.pb.js',
  'stats.pb.js',
] as const;

const verifiedBusinessCollections = [
  'account_deletions',
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
  'user_dashboard_stats',
  'user_yearly_stats',
  'coloring_page_color_references',
] as const;

const extractStatsRoutes = (source: string) =>
  Array.from(source.matchAll(/routerAdd\(\s*'([^']+)'\s*,\s*'([^']+)'/g)).map(
    ([, method, path]) => `${method} ${path}`
  );

const extractRecordHooks = (source: string) =>
  Array.from(
    source.matchAll(/onRecord(Create|Update|Delete)\s*\([\s\S]*?\n\},\s*'([^']+)'\);/g)
  ).map(([, action, collection]) => `${action} ${collection}`);

const extractRecordRequestHooks = (source: string) =>
  Array.from(
    source.matchAll(/onRecord(Create|Update|Delete)Request\s*\([\s\S]*?\n\},\s*'([^']+)'\);/g)
  ).map(([, action, collection]) => `${action} ${collection}`);

type HookEvent = {
  context: {
    value: (key: string) => unknown;
  };
  record: {
    get: (field: string) => unknown;
    getInt: (field: string) => number;
    getString: (field: string) => string;
    original: () => HookEvent['record'];
    set: (field: string, value: unknown) => void;
  };
  app: {
    db: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    deleteWithContext: ReturnType<typeof vi.fn>;
    findCollectionByNameOrId: ReturnType<typeof vi.fn>;
    findRecordById: ReturnType<typeof vi.fn>;
    findRecordsByFilter: ReturnType<typeof vi.fn>;
    runInTransaction: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  next: ReturnType<typeof vi.fn>;
};

class MockContext {
  private readonly parent?: MockContext;
  private readonly key?: string;
  private readonly storedValue?: unknown;

  constructor(parent?: MockContext, key?: string, value?: unknown) {
    this.parent = parent;
    this.key = key;
    this.storedValue = value;
  }

  value(key: string) {
    if (key === this.key) return this.storedValue;
    return this.parent?.value(key);
  }
}

class MockApiError extends Error {
  readonly data: Record<string, unknown>;

  constructor(message: string, data: Record<string, unknown> = {}) {
    super(message);
    this.data = data;
  }
}

class MockValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const loadColoringBookHooks = () => {
  const creates: Array<(event: HookEvent) => void> = [];
  const updates: Array<(event: HookEvent) => void> = [];
  const pageCreates: Array<(event: HookEvent) => void> = [];
  const pageUpdates: Array<(event: HookEvent) => void> = [];

  runInNewContext(readHook('coloring.pb.js'), {
    ApiError: MockApiError,
    BadRequestError: MockApiError,
    Context: MockContext,
    DynamicModel: class DynamicModel {
      constructor(values: Record<string, unknown>) {
        Object.assign(this, values);
      }
    },
    ForbiddenError: MockApiError,
    Record: class Record {},
    ValidationError: MockValidationError,
    $apis: { requireAuth: vi.fn() },
    onRecordCreate: (handler: (event: HookEvent) => void, collection: string) => {
      if (collection === 'coloring_books') creates.push(handler);
      if (collection === 'coloring_pages') pageCreates.push(handler);
    },
    onRecordUpdate: (handler: (event: HookEvent) => void, collection: string) => {
      if (collection === 'coloring_books') updates.push(handler);
      if (collection === 'coloring_pages') pageUpdates.push(handler);
    },
    onRecordDelete: () => undefined,
    onRecordUpdateRequest: () => undefined,
    routerAdd: () => undefined,
  });

  return {
    createBook: creates[0],
    updateBook: updates[0],
    createPage: pageCreates[0],
    updatePage: pageUpdates[0],
  };
};

const coloringBookHookEvent = (
  totalPages: number,
  previousTotalPages = totalPages,
  isArchiveRestore = false,
  queryResults: {
    completedPages?: number;
    reduction?: { extraPages: number; highestWorkedPage?: number; workedPages: number };
  } = {}
): HookEvent => {
  const record = {
    id: 'book-1',
    get: (field: string) => (field === 'total_pages' ? totalPages : undefined),
    getInt: (field: string) => (field === 'total_pages' ? totalPages : 0),
    getString: (field: string) => (field === 'status' ? 'purchased' : ''),
    original: () => ({
      ...record,
      get: (field: string) => (field === 'total_pages' ? previousTotalPages : undefined),
      getInt: (field: string) => (field === 'total_pages' ? previousTotalPages : 0),
      getString: (field: string) => (field === 'status' ? 'not_started' : record.getString(field)),
    }),
    set: vi.fn(),
  };

  return {
    context: new MockContext(undefined, 'organized_glitter_archive_restore', isArchiveRestore),
    record,
    app: {
      db: vi.fn(() => ({
        newQuery: (query: string) => ({
          bind: () => ({
            one: (model: Record<string, unknown>) => {
              Object.assign(
                model,
                query.includes('COUNT(*) AS extraPages')
                  ? (queryResults.reduction ?? { extraPages: 0, workedPages: 0 })
                  : { completedPages: queryResults.completedPages ?? 0 }
              );
            },
          }),
        }),
      })),
      delete: vi.fn(),
      deleteWithContext: vi.fn(),
      findCollectionByNameOrId: vi.fn(),
      findRecordById: vi.fn(() => {
        throw new Error('Stop after page reconciliation');
      }),
      findRecordsByFilter: vi.fn(),
      runInTransaction: vi.fn(callback => callback({})),
      save: vi.fn(),
    },
    next: vi.fn(),
  };
};

describe('PocketBase production hooks', () => {
  it('requires verified users for authentication and every business collection rule', () => {
    const users = readCollection('users');
    expect(users).toMatchObject({
      authRule: 'verified = true',
      createRule: '',
    });

    for (const field of ['listRule', 'viewRule', 'updateRule', 'deleteRule'] as const) {
      expect(users?.[field], `users.${field}`).toMatch(/^@request\.auth\.verified = true/);
    }

    const schema = readSchema();
    for (const collectionName of verifiedBusinessCollections) {
      const collection = schema.find(item => item.name === collectionName);
      expect(collection, collectionName).toBeDefined();

      for (const field of [
        'listRule',
        'viewRule',
        'createRule',
        'updateRule',
        'deleteRule',
      ] as const) {
        if (collection?.[field] !== null) {
          expect(collection?.[field], `${collectionName}.${field}`).toMatch(
            /^@request\.auth\.verified = true/
          );
        }
      }
    }
  });

  it.each([
    [
      '1789940323_normalize_legacy_index_metadata.js',
      'CREATE INDEX `idx_coloring_books_completion_percentage` ON `coloring_books` (`completion_percentage`);\n',
    ],
    [
      '1789940323_normalize_legacy_index_metadata.js',
      'CREATE INDEX `idx_coloring_books_last_activity_at` ON `coloring_books` (`last_activity_at`);',
    ],
    [
      '1789940323_repair_production_book_indexes.js',
      'CREATE INDEX idx_coloring_books_user_status\nON coloring_books (user, status);',
    ],
    [
      '1789940323_repair_production_book_indexes.js',
      'CREATE INDEX idx_coloring_books_user_last_activity_at ON coloring_books (user, last_activity_at);\n',
    ],
    [
      '1789940323_repair_production_page_indexes.js',
      'CREATE INDEX idx_coloring_pages_completed_at ON coloring_pages (completed_at);\n',
    ],
    [
      '1789940323_repair_production_page_indexes.js',
      'CREATE INDEX idx_coloring_pages_book_status ON coloring_pages (book, status);\n',
    ],
  ])('preserves custom indexes and supports rerunning %s', (file, known) => {
    let migrateUp: (app: unknown) => void = () => {};
    runInNewContext(readMigration(file), {
      migrate: (up: typeof migrateUp) => {
        migrateUp = up;
      },
    });
    const custom = "CREATE INDEX custom_index ON coloring_books (title) WHERE title = 'custom;';";
    const target = file.includes('page_indexes') ? 'coloring_pages' : 'coloring_books';
    const collections = new Map([
      [target, { id: 'target', indexes: [known, custom] }],
      ['progress_notes', { id: 'notes', indexes: [] as string[] }],
      ['projects', { id: 'projects', indexes: [] as string[] }],
    ]);
    const execute = vi.fn();
    const reloadCachedCollections = vi.fn();
    const newQuery = vi.fn(() => ({
      bind: (parameters: { id: string; original: string; indexes: string }) => ({
        execute: () => {
          const collection = [...collections.values()].find(item => item.id === parameters.id)!;
          expect(JSON.stringify(collection.indexes)).toBe(parameters.original);
          collection.indexes = JSON.parse(parameters.indexes);
          execute();
          return { rowsAffected: () => 1 };
        },
      }),
    }));
    const app = {
      findCollectionByNameOrId: (name: string) => collections.get(name),
      db: () => ({ newQuery }),
      reloadCachedCollections,
    };
    migrateUp(app);
    expect(collections.get(target)?.indexes).toEqual([known.replace(/;\s*$/, ''), custom]);
    expect(newQuery).toHaveBeenCalledWith(
      'UPDATE _collections SET indexes = {:indexes} WHERE id = {:id} AND indexes = {:original}'
    );
    expect(execute).toHaveBeenCalledOnce();
    expect(reloadCachedCollections).toHaveBeenCalledOnce();
    migrateUp(app);
    expect(execute).toHaveBeenCalledOnce();
    expect(reloadCachedCollections).toHaveBeenCalledOnce();
  });

  it('backfills OAuth accounts before enforcing the verified auth rule', () => {
    const migration = readMigration('1789940324_enforce_verified_auth.js');

    expect(migration).toContain('UPDATE users');
    expect(migration).toContain('FROM _externalAuths');
    expect(migration).toContain('WHERE collectionRef = {:collectionId}');
    expect(migration.indexOf('.execute();')).toBeLessThan(
      migration.indexOf('users.authRule = VERIFIED_AUTH_RULE')
    );
    expect(migration).toContain('users.authToken.secret = $security.randomString(50)');
    expect(migration.indexOf('users.authRule = VERIFIED_AUTH_RULE')).toBeLessThan(
      migration.indexOf('users.authToken.secret')
    );
  });

  it('requires verified auth in every custom application route', () => {
    for (const fileName of customRouteHookFiles) {
      const source = readHook(fileName);
      const routeCount = source.match(/routerAdd\(/g)?.length ?? 0;
      const verifiedGuardCount =
        source.match(/if \(!e\.auth\.getBool\('verified'\)\)/g)?.length ?? 0;

      expect(verifiedGuardCount, fileName).toBe(routeCount);
      expect(source, fileName).toContain(
        "throw new ForbiddenError('Email verification is required.');"
      );
    }
  });

  it.each([
    ['negative', -1],
    ['fractional', 1.5],
    ['non-finite', Number.POSITIVE_INFINITY],
    ['over-limit', 501],
  ])('rejects %s coloring book page counts before create child writes', (_label, totalPages) => {
    const { createBook } = loadColoringBookHooks();
    const event = coloringBookHookEvent(totalPages);

    expect(() => createBook(event)).toThrow(/invalid coloring book page count/i);
    expect(event.next).not.toHaveBeenCalled();
    expect(event.app.findCollectionByNameOrId).not.toHaveBeenCalled();
    expect(event.app.save).not.toHaveBeenCalled();
  });

  it('rejects page-count growth above 500 before update child writes', () => {
    const { updateBook } = loadColoringBookHooks();
    const event = coloringBookHookEvent(601, 600);

    expect(() => updateBook(event)).toThrow(/invalid coloring book page count/i);
    expect(event.next).not.toHaveBeenCalled();
    expect(event.app.findCollectionByNameOrId).not.toHaveBeenCalled();
    expect(event.app.save).not.toHaveBeenCalled();
  });

  it('does not generate children when an existing oversized count is unchanged', () => {
    const { updateBook } = loadColoringBookHooks();
    const event = coloringBookHookEvent(600, 600);

    updateBook(event);

    expect(event.next).toHaveBeenCalledOnce();
    expect(event.app.findCollectionByNameOrId).not.toHaveBeenCalled();
    expect(event.app.findRecordsByFilter).not.toHaveBeenCalled();
    expect(event.app.save).not.toHaveBeenCalled();
  });

  it.each(['create', 'update'] as const)(
    'leaves restored legacy page generation to the bounded archive route on %s',
    action => {
      const hooks = loadColoringBookHooks();
      const event = coloringBookHookEvent(600, 500, true);

      hooks[action === 'create' ? 'createBook' : 'updateBook'](event);

      expect(event.next).toHaveBeenCalledOnce();
      expect(event.app.findCollectionByNameOrId).not.toHaveBeenCalled();
      expect(event.app.findRecordsByFilter).not.toHaveBeenCalled();
      expect(event.app.save).not.toHaveBeenCalled();
    }
  );

  it.each(['create', 'update'] as const)(
    'preserves page metadata and skips parent metrics during archive %s',
    action => {
      const hooks = loadColoringBookHooks();
      const event = coloringBookHookEvent(600, 500, true);
      event.record.getString = (field: string) => {
        if (field === 'status') return 'completed';
        if (field === 'book') return 'book-1';
        return '';
      };

      hooks[action === 'create' ? 'createPage' : 'updatePage'](event);

      expect(event.next).toHaveBeenCalledOnce();
      expect(event.record.set).not.toHaveBeenCalled();
      expect(event.app.findRecordById).not.toHaveBeenCalled();
      expect(event.app.save).not.toHaveBeenCalled();
    }
  );

  it('deletes a bounded untouched reduction through the trusted cleanup context', () => {
    const { updateBook } = loadColoringBookHooks();
    const event = coloringBookHookEvent(550, 600, false, {
      reduction: { extraPages: 50, workedPages: 0 },
    });
    const extraPage = { id: 'extra-page' };
    event.app.findRecordsByFilter.mockReturnValueOnce([extraPage]).mockReturnValue([]);

    updateBook(event);

    expect(event.app.findRecordsByFilter).toHaveBeenCalledWith(
      'coloring_pages',
      'book = {:bookId} && page_number > {:nextTotalPages}',
      '-page_number',
      500,
      0,
      { bookId: 'book-1', nextTotalPages: 550 }
    );
    expect(event.app.deleteWithContext).toHaveBeenCalledOnce();
    expect(
      event.app.deleteWithContext.mock.calls[0][0].value('organized_glitter_page_reduction_cleanup')
    ).toBe(true);
    expect(event.app.delete).not.toHaveBeenCalled();
  });

  it('rejects an oversized direct reduction before saving or deleting pages', () => {
    const { updateBook } = loadColoringBookHooks();
    const event = coloringBookHookEvent(550, 1200, false, {
      reduction: { extraPages: 650, workedPages: 0 },
    });

    let error: unknown;
    try {
      updateBook(event);
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      data: {
        total_pages: {
          code: 'validation_page_reduction_limit',
        },
      },
    });
    expect(event.next).not.toHaveBeenCalled();
    expect(event.app.deleteWithContext).not.toHaveBeenCalled();
    expect(event.app.delete).not.toHaveBeenCalled();
    expect(event.app.save).not.toHaveBeenCalled();
  });

  it('rejects a reduction that would exclude a worked page', () => {
    const { updateBook } = loadColoringBookHooks();
    const event = coloringBookHookEvent(100, 1200, false, {
      reduction: { extraPages: 1100, highestWorkedPage: 900, workedPages: 1 },
    });

    let error: unknown;
    try {
      updateBook(event);
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      message: expect.stringMatching(/would exclude worked pages/i),
      data: {
        total_pages: {
          code: 'validation_worked_pages',
          message: 'Total pages cannot be less than 900 because that page has saved work.',
        },
      },
    });
    expect(event.next).not.toHaveBeenCalled();
    expect(event.app.deleteWithContext).not.toHaveBeenCalled();
  });

  it('excludes preserved pages above the declared count from completion rollups', () => {
    const hook = readHook('coloring.pb.js');

    expect(
      hook.match(
        /LEFT JOIN coloring_pages cp ON cp\.book = cb\.id AND cp\.page_number <= cb\.total_pages/g
      )
    ).toHaveLength(3);
    expect(hook).toContain('AND cp.page_number <= {:nextTotalPages}');
  });

  it('rounds legacy completion percentages before saving integer-only metrics', () => {
    const { createPage } = loadColoringBookHooks();
    const event = coloringBookHookEvent(501);
    const book = { set: vi.fn() };
    event.record.getString = (field: string) => {
      if (field === 'status') return 'completed';
      if (field === 'book') return 'book-1';
      return '';
    };
    event.app.findRecordById.mockReturnValue(book);
    event.app.db.mockReturnValue({
      newQuery: () => ({
        bind: () => ({
          one: (metrics: Record<string, unknown>) => {
            metrics.totalPages = 501;
            metrics.completedPages = 1;
          },
        }),
      }),
    });

    createPage(event);

    expect(book.set).toHaveBeenCalledWith('completed_pages', 1);
    expect(book.set).toHaveBeenCalledWith('completion_percentage', 0);
    expect(event.app.save).toHaveBeenCalledWith(book);
    expect(readHook('coloring.pb.js').match(/Math\.round\(/g)).toHaveLength(4);
  });

  it.each([
    ['negative', -1],
    ['fractional', 1.5],
    ['non-finite', Number.POSITIVE_INFINITY],
  ])('rejects %s coloring book page counts before update child writes', (_label, totalPages) => {
    const { updateBook } = loadColoringBookHooks();
    const event = coloringBookHookEvent(totalPages, 20);

    expect(() => updateBook(event)).toThrow(/invalid coloring book page count/i);
    expect(event.next).not.toHaveBeenCalled();
    expect(event.app.findCollectionByNameOrId).not.toHaveBeenCalled();
    expect(event.app.save).not.toHaveBeenCalled();
  });
  it('keeps every stats endpoint registered in the hook source', () => {
    expect(extractStatsRoutes(readHook('stats.pb.js'))).toEqual([
      'GET /api/stats/summary',
      'GET /api/stats/completions',
      'GET /api/stats/completions/yearly',
      'GET /api/stats/completion-times',
      'GET /api/stats/company-project-counts',
      'GET /api/stats/artist-project-counts',
      'GET /api/stats/tag-project-counts',
      'GET /api/stats/coloring-tag-book-counts',
      'GET /api/stats/collection',
      'GET /api/stats/month-in-review',
      'GET /api/stats/coloring/summary',
      'GET /api/stats/coloring/completions',
      'GET /api/stats/coloring/completions/yearly',
      'GET /api/stats/coloring/completion-times',
      'GET /api/stats/coloring/collection',
    ]);
  });

  it('aggregates company project counts for the authenticated user', () => {
    const hook = readHook('stats.pb.js');
    const route = hook.slice(hook.indexOf("'/api/stats/company-project-counts'"));

    expect(route).toContain('$apis.requireAuth()');
    expect(route).toContain('WHERE p.user = {:userId}');
    expect(route).toContain('AND c.user = {:userId}');
    expect(route).toContain('GROUP BY p.company');
  });

  it('aggregates artist project counts for the authenticated user', () => {
    const hook = readHook('stats.pb.js');
    const start = hook.indexOf("'/api/stats/artist-project-counts'");
    const route = hook.slice(start, hook.indexOf('routerAdd(', start));

    expect(route).toContain('$apis.requireAuth()');
    expect(route).toContain('WHERE p.user = {:userId}');
    expect(route).toContain('AND a.user = {:userId}');
    expect(route).toContain('GROUP BY p.artist');
  });

  it('aggregates tag usage for the authenticated user', () => {
    const hook = readHook('stats.pb.js');
    const diamondStart = hook.indexOf("'/api/stats/tag-project-counts'");
    const coloringStart = hook.indexOf("'/api/stats/coloring-tag-book-counts'");
    const collectionStart = hook.indexOf("'/api/stats/collection'");
    const diamondRoute = hook.slice(diamondStart, coloringStart);
    const coloringRoute = hook.slice(coloringStart, collectionStart);

    expect(diamondRoute).toContain('$apis.requireAuth()');
    expect(diamondRoute).toContain('WHERE p.user = {:userId}');
    expect(diamondRoute).toContain('AND t.user = {:userId}');
    expect(diamondRoute).toContain('GROUP BY pt.tag');
    expect(coloringRoute).toContain('$apis.requireAuth()');
    expect(coloringRoute).toContain('WHERE cb.user = {:userId}');
    expect(coloringRoute).toContain('AND t.user = {:userId}');
    expect(coloringRoute).toContain('GROUP BY cbt.tag');
  });

  it('restores archive page metadata with an authenticated atomic compare and update', () => {
    const hook = readHook('archive_restore.pb.js');

    expect(hook).toContain("'POST',\n  '/api/archive/restore-coloring-page-metadata'");
    expect(hook).toContain("$apis.requireAuth('users')");
    expect(hook).toContain('e.app.runInTransaction(txApp =>');
    expect(hook).toContain("txApp.findRecordById('coloring_pages', body.pageId)");
    expect(hook).toContain("book.getString('user') !== authId");
    expect(hook).toContain("medium.getString('user') !== authId");
    expect(hook.indexOf('metadataMatches(current, intended)')).toBeLessThan(
      hook.indexOf('current.updatedAt !== baseline.updatedAt')
    );
    expect(hook).toContain("reason: 'archive_restore_conflict'");
    expect(hook).toContain('txApp.saveWithContext(archiveContext, page)');
    expect(hook).toContain("throw new Error('Archive page metadata did not persist exactly.')");
  });

  it('restores diamond project color count through the archive route', () => {
    const hook = readHook('archive_restore.pb.js');
    const start = hook.indexOf("'/api/archive/restore-diamond-project'");
    const end = hook.indexOf("'/api/archive/restore-coloring-book'", start);
    const route = hook.slice(start, end);

    expect(route).toContain('colorCount: 0');
    expect(route).toContain("project.set('color_count', body.colorCount)");
  });

  it('restores archive coloring books in authenticated bounded batches', () => {
    const hook = readHook('archive_restore.pb.js');

    expect(hook).toContain("'/api/archive/restore-coloring-book'");
    expect(hook).toContain("$apis.requireAuth('users')");
    expect(hook).toContain("'organized_glitter_archive_restore'");
    expect(hook).toContain('body.pageCount > 100');
    expect(hook).toContain(
      '.sha256(`${authId}\\0${body.archiveFingerprint}\\0${body.archiveBookRef}`)'
    );
    expect(hook).toContain('txApp.saveWithContext(archiveContext, book)');
    expect(hook).toContain('txApp.saveWithContext(archiveContext, page)');
    expect(hook).toContain("'page_number',\n        100,");
    expect(hook).toContain("typeof body.allowCreate !== 'boolean'");
    expect(hook).toContain("reason: 'archive_recovery_target_missing'");
  });

  it('reconciles archive book metrics from stored pages without restoring book metadata', () => {
    const hook = readHook('archive_restore.pb.js');
    const route = hook.slice(hook.indexOf("'/api/archive/reconcile-coloring-book-metrics'"));

    expect(route).toContain("$apis.requireAuth('users')");
    expect(route).toContain("txApp.findRecordById('coloring_books', body.bookId)");
    expect(route).toContain("book.getString('user') !== authId");
    expect(route).toContain("status = 'completed'");
    expect(route).toContain('page_number <= {:totalPages}');
    expect(route).toContain("book.set('completed_pages', completedPages)");
    expect(route).toContain("book.set('completion_percentage', completionPercentage)");
    expect(route).toContain('txApp.saveWithContext(archiveContext, book)');
    expect(route).not.toContain("book.set('status'");
    expect(route).not.toContain("book.set('date_started'");
    expect(route).not.toContain("book.set('date_completed'");
  });

  it('keeps every record lifecycle hook registered in the hook source', () => {
    expect(extractRecordHooks(readHook('coloring.pb.js'))).toEqual([
      'Create coloring_books',
      'Update coloring_books',
      'Create coloring_pages',
      'Update coloring_pages',
      'Delete coloring_pages',
    ]);

    expect(extractRecordHooks(readHook('sort_proxy_sync.pb.js'))).toEqual([
      'Create projects',
      'Update projects',
      'Update companies',
      'Update artists',
    ]);

    expect(extractRecordHooks(readHook('dashboard_settings.pb.js'))).toEqual([
      'Create user_dashboard_settings',
      'Update user_dashboard_settings',
    ]);
  });

  it('guards the coloring_pages mediums relation against foreign ownership', () => {
    const hook = readHook('coloring_medium_ownership.pb.js');

    expect(extractRecordRequestHooks(hook)).toEqual([
      'Create coloring_pages',
      'Update coloring_pages',
    ]);
    expect(hook).toContain("e.app.findRecordById('coloring_mediums', mediumId)");
    expect(hook).toContain("medium.getString('user') !== authId");
  });

  it('makes account deletion identity fields server-owned', () => {
    const hook = readHook('account_deletion_integrity.pb.js');

    expect(extractRecordRequestHooks(hook)).toEqual(['Create account_deletions']);
    expect(hook).toContain("e.record.set('user_id', authId)");
    expect(hook).toContain("e.record.set('user_email', email || 'unknown')");
    expect(hook.indexOf("e.record.set('user_id', authId)")).toBeLessThan(hook.indexOf('e.next()'));
  });

  it('requires same-owner taxonomy relations on create and update', () => {
    expect(readCollection('projects')).toMatchObject({
      createRule: expect.stringContaining('company.user = @request.auth.id'),
      updateRule: expect.stringContaining('artist.user = @request.auth.id'),
    });
    expect(readCollection('project_tags')).toMatchObject({
      createRule: expect.stringContaining('tag.user = @request.auth.id'),
      updateRule: expect.stringContaining('tag.user = @request.auth.id'),
    });
    expect(readCollection('coloring_books')).toMatchObject({
      createRule: expect.stringContaining('publisher.user = @request.auth.id'),
      updateRule: expect.stringContaining('illustrator.user = @request.auth.id'),
    });
    expect(readCollection('coloring_book_tags')).toMatchObject({
      createRule: expect.stringContaining('tag.user = @request.auth.id'),
      updateRule: expect.stringContaining('tag.user = @request.auth.id'),
    });
    expect(readCollection('randomizer_spins')).toMatchObject({
      createRule: expect.stringContaining('project.user = @request.auth.id'),
      updateRule: expect.stringContaining('project.user = @request.auth.id'),
    });
  });

  it('guards all changed ownership and parent relations during update requests', () => {
    const hook = readHook('relation_ownership.pb.js');

    expect(hook.match(/onRecordUpdateRequest\(/g)).toHaveLength(1);
    expect(hook).toContain('e.hasSuperuserAuth()');
    expect(hook).toContain("authId === ''");
    expect(hook).toContain("ForbiddenError('Authentication is required.')");
    expect(hook).toContain('e.collection.name');
    expect(hook).toContain('directOwnerCollections');
    for (const collection of [
      'progress_notes',
      'coloring_pages',
      'coloring_page_progress_notes',
      'randomizer_spins',
    ]) {
      expect(hook).toContain(`'${collection}'`);
    }
    expect(hook).toContain('e.record.original().getString(field)');
    expect(hook).toContain("logger().error('relation_ownership: relation lookup failed'");
    expect(hook).toContain("reason: 'related_record_lookup_failed'");
    expect(hook).toContain('relatedOwner !== authId');
    expect(hook).toContain("relatedCollection === 'coloring_pages'");
    expect(hook.indexOf("findRecordById('coloring_books'")).toBeLessThan(
      hook.indexOf('} catch (_err) {')
    );
  });

  it('rejects deleting taxonomy records that are still referenced', () => {
    const hook = readHook('taxonomy_deletion_guard.pb.js');

    expect(hook.match(/onRecordDeleteRequest\(/g)).toHaveLength(1);
    expect(hook).toContain('e.hasSuperuserAuth()');
    for (const collection of [
      'companies',
      'artists',
      'tags',
      'book_publishers',
      'book_illustrators',
      'coloring_mediums',
      'coloring_tags',
    ]) {
      expect(hook).toContain(`${collection}:`);
    }
    expect(hook).toContain("coloring_pages', 'mediums.id', '?='");
    expect(hook).toContain('e.app.findRecordsByFilter(');
    expect(hook).toContain("BadRequestError('This list item is still in use.'");
  });

  it('backs taxonomy deletion checks with atomic database triggers', () => {
    const migration = readMigration('1785182000_atomic_taxonomy_delete_guards.js');

    expect(migration.match(/name: 'guard_[^']+_delete_in_use'/g)).toHaveLength(7);
    expect(migration).toContain('BEFORE DELETE ON ${definition.table}');
    expect(migration).toContain('json_each(page.mediums)');
    expect(migration).toContain("RAISE(ABORT, 'This list item is still in use.')");
  });

  it('scopes the coloring medium stats join to the requesting user', () => {
    const hook = readHook('stats.pb.js');

    expect(hook).toContain('JOIN coloring_mediums m ON m.id = medium_ids.value');
    expect(hook).toContain('AND m.user = {:userId}');
  });

  it('does not use top-level helper functions inside PocketBase callbacks', () => {
    for (const fileName of productionHookFiles) {
      const source = readHook(fileName);

      expect(source, `${fileName} should keep callback helper logic self-contained`).not.toMatch(
        /^(function\s+\w+\s*\(|const\s+\w+\s*=\s*(function|\([^)]*\)\s*=>|\w+\s*=>))/m
      );
    }
  });

  it('keeps bootstrap hooks synchronous for the PocketBase JSVM runtime', () => {
    for (const fileName of ['create_indexes.pb.js']) {
      const source = readHook(fileName);

      expect(source, `${fileName} should not register async bootstrap handlers`).not.toContain(
        'onBootstrap(async'
      );
      expect(source, `${fileName} should not await inside bootstrap hooks`).not.toContain('await ');
      expect(source, `${fileName} should use synchronous database statements`).toMatch(
        /\$app\s*\.db\(\)\s*\.newQuery\(/
      );
    }
  });

  it('does not synthesize project completed dates in production hooks', () => {
    const hookFiles = readHookFiles();

    expect(hookFiles).not.toContain('projects.pb.js');
    for (const fileName of hookFiles) {
      const hook = readHook(fileName);
      expect(
        hook,
        `${fileName} should not use the old project completed-date helper`
      ).not.toContain('setCompletedDateIfNeeded');
      expect(hook, `${fileName} should not auto-fill project completed dates`).not.toContain(
        "date_completed', new Date().toISOString()"
      );
    }
  });

  it('does not reference the old coloring metrics helper from record callbacks', () => {
    const hook = readHook('coloring.pb.js');

    expect(hook).not.toContain("e.record.set('ownership'");
    expect(hook).not.toContain('syncColoringBookMetrics');
    expect(hook).toContain("e.app.findRecordById('coloring_books', bookId)");
    expect(hook).toContain('AS totalPages');
    expect(hook).toContain('AS completedPages');
  });

  it('keeps project sort-proxy logic inside record callbacks', () => {
    const hook = readHook('sort_proxy_sync.pb.js');

    expect(hook).not.toContain('computeSortProxyFields');
    expect(hook).toContain("record.set('title_sort', stripLeading(title).toLowerCase())");
    expect(hook).toContain("record.set('company_name_sort', companyName)");
    expect(hook).toContain("record.set('status_order', statusOrderByStatus[status] || 0)");
    expect(hook).toContain("record.set('date_completed_has_value', dateCompleted ? 0 : 1)");
  });
});
