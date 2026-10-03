import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFilter } from '@/services/pocketbase/base/filterBuilder';

vi.mock('@/services/pocketbase/base/filtering', () => ({
  pbFilter: (expr: string, params?: Record<string, unknown>) => {
    if (!params) return expr;
    let result = expr;
    for (const [key, value] of Object.entries(params)) {
      result = result.replace(`{:${key}}`, String(value));
    }
    return result;
  },
  toPocketBaseFilter: (filter: string) => filter,
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
  }),
}));

describe('FilterBuilder', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds user-scoped filters with parameterized values', () => {
    expect(createFilter().userScope('user-123').build()).toBe('user = user-123');
  });

  it('builds date ranges for allowlisted fields', () => {
    expect(createFilter().dateRange('date', { year: 2026 }).build()).toBe(
      'date >= 2026-01-01 && date <= 2026-12-31'
    );
  });

  it('skips non-allowlisted dynamic fields in production mode', () => {
    vi.stubEnv('DEV', false);

    expect(createFilter().equals('not_a_real_field', 'value').build()).toBe('');
  });
});
