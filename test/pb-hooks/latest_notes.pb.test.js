import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE projects (id TEXT, user TEXT);
    CREATE TABLE coloring_books (id TEXT, user TEXT);
    CREATE TABLE coloring_pages (id TEXT, book TEXT);
    CREATE TABLE progress_notes (id TEXT, project TEXT, date TEXT, created TEXT);
    CREATE TABLE coloring_page_progress_notes (id TEXT, page TEXT, user TEXT, date TEXT, created TEXT);
    INSERT INTO projects VALUES ('own','user1'), ('foreign','user2'), ('empty','user1');
    INSERT INTO coloring_books VALUES ('book1','user1'), ('book2','user2');
    INSERT INTO coloring_pages VALUES ('own','book1'), ('foreign','book2'), ('empty','book1');
  `);
  let handler;
  let authCollection;
  let queries = 0;
  vm.runInNewContext(readFileSync('pb_hooks/latest_notes.pb.js', 'utf8'), {
    DynamicModel: class {
      constructor(value) {
        Object.assign(this, value);
      }
    },
    arrayOf: () => [],
    ForbiddenError: Error,
    BadRequestError: Error,
    $apis: {
      requireAuth: collection => {
        authCollection = collection;
      },
    },
    routerAdd: (_method, _path, callback) => {
      handler = callback;
    },
    $app: {
      db: () => ({
        newQuery: sql => ({
          bind: params => ({
            all: rows => {
              queries++;
              const query = sql.replace(/\{:([a-zA-Z0-9]+)\}/g, ':$1');
              rows.push(...db.prepare(query).all(params));
            },
          }),
        }),
      }),
    },
  });
  return {
    db,
    get queries() {
      return queries;
    },
    authCollection,
    request: (craft, targetIds, userId = 'user1', verified = true) =>
      handler({
        auth: {
          id: 'user1',
          getBool: fieldName => fieldName === 'verified' && verified,
          getString: () => 'user1',
        },
        requestInfo: () => ({ body: { craft, targetIds, userId } }),
        json: (status, body) => ({ status, body }),
      }),
  };
}

describe('latest note route', () => {
  it('rejects unverified users before querying', () => {
    const app = setup();

    expect(() => app.request('diamond', ['own'], 'user1', false)).toThrow(
      'Email verification is required.'
    );
    expect(app.queries).toBe(0);
    app.db.close();
  });

  for (const craft of ['diamond', 'coloring']) {
    it(`returns one deterministically latest ${craft} note per owned target in one query`, () => {
      const app = setup();
      const table = craft === 'diamond' ? 'progress_notes' : 'coloring_page_progress_notes';
      const owner = craft === 'diamond' ? '' : ",'user1'";
      app.db.exec(`INSERT INTO ${table} VALUES
        ('old','own'${owner},'2025-01-01','2026-09-06'),
        ('a','own'${owner},'2026-09-06','2026-09-06'),
        ('z','own'${owner},'2026-09-06','2026-09-06'),
        ('secret','foreign'${owner},'2026-09-06','2026-09-06');`);
      if (craft === 'coloring')
        app.db.exec(
          `INSERT INTO ${table} VALUES ('wronguser','own','user2','2027-01-01','2027-01-01');`
        );
      const result = app.request(craft, ['own', 'foreign', 'empty', 'own']);
      expect(result.body.items.map(row => row.id)).toEqual(['z']);
      expect(app.queries).toBe(1);
      expect(app.authCollection).toBe('users');
      app.db.close();
    });
  }

  it('rejects mismatched users and invalid or oversized requests before querying', () => {
    const app = setup();
    expect(() => app.request('diamond', ['own'], 'user2')).toThrow('User mismatch');
    expect(() => app.request('unknown', ['own'])).toThrow('Invalid craft');
    expect(() => app.request('diamond', ["' OR 1=1"])).toThrow('Invalid target');
    expect(() => app.request('diamond', Array(101).fill('own'))).toThrow('Too many targets');
    for (const value of [null, 'own', 42, {}]) {
      expect(() => app.request('diamond', value)).toThrow('Invalid targets');
    }
    expect(app.request('diamond', []).body.items).toEqual([]);
    expect(app.queries).toBe(0);
    app.db.close();
  });
});
