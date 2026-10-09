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

  it.each([
    '/api/stats/company-project-counts',
    '/api/stats/tag-project-counts',
    '/api/stats/coloring-tag-book-counts',
  ])('protects %s with PocketBase auth middleware', path => {
    const loadedHook = loadStatsHook();
    const route = loadedHook.routes.find(item => item.path === path);

    expect(route?.middlewares).toEqual([loadedHook.requireAuthMiddleware]);
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

  it('keeps the diamond in-stash metric aligned with the exact stash status', () => {
    const loadedHook = loadStatsHook();
    const { body } = invokeRoute(loadedHook, '/api/stats/summary', {
      query: { year: 2026 },
      results: [
        {
          kind: 'one',
          data: {
            totalKits: 12,
            completedThisYear: 3,
            allTimeCompleted: 5,
          },
        },
        {
          kind: 'all',
          rows: [
            { status: 'wishlist', total: 1 },
            { status: 'purchased', total: 2 },
            { status: 'stash', total: 3 },
            { status: 'kitted', total: 4 },
            { status: 'progress', total: 5 },
            { status: 'unknown', total: 99 },
          ],
        },
      ],
    });

    expect(Object.keys(body.statusBreakdown)).toEqual([
      'wishlist',
      'purchased',
      'stash',
      'kitted',
      'progress',
      'onhold',
      'completed',
      'archived',
      'destashed',
    ]);
    expect(body.statusBreakdown).toMatchObject({
      wishlist: 1,
      purchased: 2,
      stash: 3,
      kitted: 4,
      progress: 5,
      onhold: 0,
      completed: 0,
      archived: 0,
      destashed: 0,
    });
    expect(body.metrics).not.toHaveProperty('inStash');
    expect(body.metrics.inProgress).toBe(5);
    expect(body.metrics.wishlistSize).toBe(1);
  });

  it('returns twelve diamond monthly buckets with previous-year deltas', () => {
    const loadedHook = loadStatsHook();
    const { body } = invokeRoute(loadedHook, '/api/stats/completions', {
      query: { year: 2026 },
      results: [
        {
          kind: 'all',
          rows: [
            {
              month: 1,
              total: 2,
              averageCompletionDays: 4.75,
              averageCompletionCount: 2,
            },
            {
              month: 3,
              total: 1,
              averageCompletionDays: 99,
              averageCompletionCount: 0,
            },
          ],
        },
        {
          kind: 'all',
          rows: [
            { month: 1, total: 1 },
            { month: 2, total: 3 },
          ],
        },
      ],
    });

    expect(body.year).toBe(2026);
    expect(body.total).toBe(3);
    expect(body.months).toHaveLength(12);
    expect(body.months[0]).toEqual({
      month: 1,
      label: 'Jan',
      count: 2,
      previousYearCount: 1,
      previousYearDelta: 1,
      averageCompletionDays: 4.8,
    });
    expect(body.months[1]).toMatchObject({
      month: 2,
      label: 'Feb',
      count: 0,
      previousYearCount: 3,
      previousYearDelta: -3,
      averageCompletionDays: null,
    });
    expect(body.months[2]).toMatchObject({
      count: 1,
      previousYearCount: 0,
      previousYearDelta: 1,
      averageCompletionDays: null,
    });
    expect(body.months[11]).toMatchObject({
      month: 12,
      label: 'Dec',
      count: 0,
      previousYearCount: 0,
      previousYearDelta: 0,
      averageCompletionDays: null,
    });
  });

  it('uses server-backed totals for diamond top-list groups and documented size buckets', () => {
    const loadedHook = loadStatsHook();
    const { body } = invokeRoute(loadedHook, '/api/stats/collection', {
      results: [
        {
          kind: 'all',
          rows: [
            { id: 'company-1', label: 'Company A', total: 4 },
            { id: 'company-2', label: 'Company B', total: 2 },
          ],
        },
        { kind: 'one', data: { total: 10 } },
        { kind: 'all', rows: [{ id: 'artist-1', label: 'Artist A', total: 5 }] },
        { kind: 'one', data: { total: 5 } },
        { kind: 'all', rows: [{ id: 'tag-1', label: 'Tag A', total: 3 }] },
        { kind: 'one', data: { total: 2 } },
        { kind: 'all', rows: [{ key: 'round', label: 'round', total: 7 }] },
        { kind: 'all', rows: [{ key: 'full', label: 'full', total: 8 }] },
        {
          kind: 'all',
          rows: [
            { width: 29.9, height: 10 },
            { width: 30, height: 49.9 },
            { width: 0, height: 50 },
            { width: 109.9, height: 70 },
            { width: 110, height: 20 },
            { width: 0, height: 0 },
            { width: null, height: null },
          ],
        },
      ],
    });

    expect(body.topCompaniesGroup).toEqual({
      total: 10,
      items: [
        { id: 'company-1', label: 'Company A', count: 4 },
        { id: 'company-2', label: 'Company B', count: 2 },
      ],
      otherCount: 4,
    });
    expect(body.topArtistsGroup.otherCount).toBe(0);
    expect(body.topTagsGroup).toMatchObject({ total: 2, otherCount: 0 });
    expect(body.sizeBuckets).toEqual([
      { key: 'mini', label: '<30 cm', count: 1 },
      { key: 'small', label: '30-49.9 cm', count: 1 },
      { key: 'medium', label: '50-69.9 cm', count: 1 },
      { key: 'large', label: '70-109.9 cm', count: 1 },
      { key: 'huge', label: '110+ cm', count: 1 },
      { key: 'unknown', label: 'Unknown', count: 2 },
    ]);
  });

  it('keeps the coloring in-stash metric aligned with the exact in-stash status', () => {
    const loadedHook = loadStatsHook();
    const { body } = invokeRoute(loadedHook, '/api/stats/coloring/summary', {
      query: { year: 2026 },
      results: [
        {
          kind: 'one',
          data: {
            totalBooks: 8,
            completedPagesThisYear: 2,
            allTimeCompletedPages: 6,
          },
        },
        {
          kind: 'all',
          rows: [
            { status: 'wishlist', total: 1 },
            { status: 'purchased', total: 2 },
            { status: 'in_stash', total: 3 },
            { status: 'in_progress', total: 4 },
            { status: 'completed', total: 5 },
            { status: 'unknown', total: 99 },
          ],
        },
        {
          kind: 'all',
          rows: [
            { status: 'not_started', total: 6 },
            { status: 'palette_chosen', total: 7 },
            { status: 'in_progress', total: 8 },
            { status: 'on_hold', total: 9 },
            { status: 'completed', total: 10 },
          ],
        },
      ],
    });

    expect(Object.keys(body.bookStatusBreakdown)).toEqual([
      'wishlist',
      'purchased',
      'in_stash',
      'in_progress',
      'completed',
      'archived',
      'destashed',
    ]);
    expect(Object.keys(body.pageStatusBreakdown)).toEqual([
      'not_started',
      'palette_chosen',
      'in_progress',
      'on_hold',
      'completed',
    ]);
    expect(body.bookStatusBreakdown.in_stash).toBe(3);
    expect(body.metrics).not.toHaveProperty('inStash');
    expect(body.metrics.activePages).toBe(8);
    expect(body.metrics.wishlistSize).toBe(1);
  });

  it('returns twelve coloring monthly buckets with previous-year deltas', () => {
    const loadedHook = loadStatsHook();
    const { body } = invokeRoute(loadedHook, '/api/stats/coloring/completions', {
      query: { year: 2026 },
      results: [
        {
          kind: 'all',
          rows: [
            {
              month: 2,
              total: 3,
              averageCompletionDays: 7.33,
              averageCompletionCount: 3,
            },
          ],
        },
        {
          kind: 'all',
          rows: [
            { month: 2, total: 1 },
            { month: 12, total: 2 },
          ],
        },
      ],
    });

    expect(body.year).toBe(2026);
    expect(body.total).toBe(3);
    expect(body.months).toHaveLength(12);
    expect(body.months[1]).toEqual({
      month: 2,
      label: 'Feb',
      count: 3,
      previousYearCount: 1,
      previousYearDelta: 2,
      averageCompletionDays: 7.3,
    });
    expect(body.months[11]).toMatchObject({
      count: 0,
      previousYearCount: 2,
      previousYearDelta: -2,
      averageCompletionDays: null,
    });
  });

  it('uses server-backed totals for coloring top-list groups and documented completion buckets', () => {
    const loadedHook = loadStatsHook();
    const { body } = invokeRoute(loadedHook, '/api/stats/coloring/collection', {
      results: [
        {
          kind: 'all',
          rows: [
            { id: 'publisher-1', label: 'Publisher A', total: 4 },
            { id: 'publisher-2', label: 'Publisher B', total: 1 },
          ],
        },
        { kind: 'one', data: { total: 8 } },
        { kind: 'all', rows: [{ id: 'illustrator-1', label: 'Illustrator A', total: 2 }] },
        { kind: 'one', data: { total: 2 } },
        { kind: 'all', rows: [{ id: 'tag-1', label: 'Tag A', total: 3 }] },
        { kind: 'one', data: { total: 4 } },
        { kind: 'all', rows: [{ id: 'medium-1', label: 'Medium A', total: 2 }] },
        { kind: 'one', data: { total: 1 } },
        { kind: 'all', rows: [{ status: 'completed', total: 3 }] },
        { kind: 'all', rows: [{ status: 'in_progress', total: 4 }] },
        {
          kind: 'all',
          rows: [
            { completionPercentage: 0 },
            { completionPercentage: 1 },
            { completionPercentage: 49 },
            { completionPercentage: 50 },
            { completionPercentage: 99 },
            { completionPercentage: 100 },
          ],
        },
      ],
    });

    expect(body.topPublishersGroup).toEqual({
      total: 8,
      items: [
        { id: 'publisher-1', label: 'Publisher A', count: 4 },
        { id: 'publisher-2', label: 'Publisher B', count: 1 },
      ],
      otherCount: 3,
    });
    expect(body.topTagsGroup).toMatchObject({ total: 4, otherCount: 1 });
    expect(body.topMediumsGroup).toMatchObject({ total: 1, otherCount: 0 });
    expect(body.completionBuckets).toEqual([
      { key: 'not_started', label: 'Not started', count: 1 },
      { key: 'started', label: '1-49%', count: 2 },
      { key: 'halfway', label: '50-99%', count: 2 },
      { key: 'completed', label: 'Completed', count: 1 },
    ]);
  });
});
