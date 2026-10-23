import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

const STATS_ROUTES = [
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
];

class MockDynamicModel {
  constructor(defaults = {}) {
    Object.assign(this, defaults);
  }
}

class MockForbiddenError extends Error {
  constructor(message) {
    super(message);
    this.status = 403;
  }
}

function clonePayload(payload) {
  return JSON.parse(JSON.stringify(payload));
}

function loadStatsHook() {
  const routes = [];
  const requireAuthMiddleware = { name: 'requireAuth' };
  const hookPath = resolve(process.cwd(), 'pb_hooks/stats.pb.js');
  const code = readFileSync(hookPath, 'utf8');
  const context = {
    DynamicModel: MockDynamicModel,
    ForbiddenError: MockForbiddenError,
    arrayOf: () => [],
    $app: null,
    $apis: {
      requireAuth: vi.fn(() => requireAuthMiddleware),
    },
    routerAdd: (method, path, handler, ...middlewares) => {
      routes.push({ method, path, handler, middlewares });
    },
  };

  vm.runInNewContext(code, context);

  return { context, requireAuthMiddleware, routes };
}

function createEvent({ query = {}, userId = 'user-123', verified = true } = {}) {
  const queryParams = new Map(
    Object.entries(query).map(([key, value]) => [key, value == null ? '' : String(value)])
  );

  return {
    auth: {
      getBool: vi.fn(fieldName => fieldName === 'verified' && verified),
      getString: vi.fn(fieldName => (fieldName === 'id' ? userId : '')),
    },
    request: {
      url: {
        query: () => ({
          get: key => queryParams.get(key) ?? '',
        }),
      },
    },
    json: vi.fn((status, body) => ({
      status,
      body: clonePayload(body),
    })),
  };
}

function fillRows(target, rows) {
  target.length = 0;
  for (const row of rows) {
    target.push(new MockDynamicModel(row));
  }
}

function createQueryApp(results) {
  const calls = [];
  const pendingResults = [...results];

  return {
    calls,
    pendingResults,
    db: () => ({
      newQuery: query => ({
        bind: params => {
          const call = { query, params };
          calls.push(call);

          return {
            one: model => {
              const result = pendingResults.shift();
              expect(result?.kind).toBe('one');
              Object.assign(model, result.data);
            },
            all: target => {
              const result = pendingResults.shift();
              expect(result?.kind).toBe('all');
              fillRows(target, result.rows);
            },
          };
        },
      }),
    }),
  };
}

function invokeRoute(loadedHook, path, { query = {}, results }) {
  const route = loadedHook.routes.find(item => item.path === path);
  expect(route, `${path} should be registered`).toBeTruthy();

  const app = createQueryApp(results);
  const event = createEvent({ query });
  loadedHook.context.$app = app;

  const response = route.handler(event);

  expect(response.status).toBe(200);
  expect(event.auth.getString).toHaveBeenCalledWith('id');
  expect(app.pendingResults).toHaveLength(0);
  return { app, body: response.body, event };
}

describe('stats PocketBase hook contract', () => {
  it('registers all stats routes with PocketBase auth middleware', () => {
    const loadedHook = loadStatsHook();

    expect(loadedHook.routes.map(route => `${route.method} ${route.path}`)).toEqual(STATS_ROUTES);
    expect(loadedHook.context.$apis.requireAuth).toHaveBeenCalledTimes(STATS_ROUTES.length);
    for (const route of loadedHook.routes) {
      expect(route.middlewares).toEqual([loadedHook.requireAuthMiddleware]);
    }
  });

  it('rejects unverified users from every stats route', () => {
    const loadedHook = loadStatsHook();

    for (const route of loadedHook.routes) {
      expect(() => route.handler(createEvent({ verified: false }))).toThrow(
        'Email verification is required.'
      );
    }
  });

  it.each([
    {
      path: '/api/stats/company-project-counts',
      groupBy: 'GROUP BY p.company',
      ownerPredicates: ['WHERE p.user = {:userId}', 'AND c.user = {:userId}'],
    },
    {
      path: '/api/stats/artist-project-counts',
      groupBy: 'GROUP BY p.artist',
      ownerPredicates: ['WHERE p.user = {:userId}', 'AND a.user = {:userId}'],
    },
    {
      path: '/api/stats/tag-project-counts',
      groupBy: 'GROUP BY pt.tag',
      ownerPredicates: ['WHERE p.user = {:userId}', 'AND t.user = {:userId}'],
    },
    {
      path: '/api/stats/coloring-tag-book-counts',
      groupBy: 'GROUP BY cbt.tag',
      ownerPredicates: ['WHERE cb.user = {:userId}', 'AND t.user = {:userId}'],
    },
  ])('returns authenticated aggregate counts from $path', ({ path, groupBy, ownerPredicates }) => {
    const loadedHook = loadStatsHook();
    const { app, body } = invokeRoute(loadedHook, path, {
      results: [
        {
          kind: 'all',
          rows: [
            { id: 'used-first', total: '3' },
            { id: 'used-second', total: 1 },
          ],
        },
      ],
    });

    expect(body).toEqual({
      counts: {
        'used-first': 3,
        'used-second': 1,
      },
    });
    expect(app.calls).toHaveLength(1);
    expect(app.calls[0].params).toEqual({ userId: 'user-123' });
    expect(app.calls[0].query).toContain(groupBy);
    for (const predicate of ownerPredicates) {
      expect(app.calls[0].query).toContain(predicate);
    }
  });
});
