import { describe, expect, it } from 'vitest';

import { queryFreshnessRule, refetchDefaultsRule } from '../../config/eslint-query-rules.js';
import {
  checkQueryLintPlacement,
  placementCases,
  placementFailures,
} from '../check-query-lint-placement.mjs';

const restricted = rule => ({ ruleId: 'no-restricted-syntax', severity: 2, message: rule.message });
const refetchCase = {
  filePath: 'src/hooks/useExample.ts',
  code: '',
  expected: [refetchDefaultsRule],
};
const cleanCase = { filePath: 'src/hooks/useExample.test.ts', code: '', expected: [] };

describe('query lint placement evaluation', () => {
  it('accepts exactly the expected restricted-syntax messages', () => {
    expect(placementFailures(refetchCase, [restricted(refetchDefaultsRule)])).toEqual([]);
    expect(placementFailures(cleanCase, [])).toEqual([]);
  });

  it('fails when an expected rule did not report', () => {
    expect(placementFailures(refetchCase, [])).toHaveLength(1);
  });

  it('fails on parse or configuration errors instead of filtering them out', () => {
    const parseError = { ruleId: null, fatal: true, severity: 2, message: 'Parsing error: x' };

    expect(placementFailures(cleanCase, [parseError])).toEqual([
      expect.stringMatching(/Parsing error: x/),
    ]);
    expect(placementFailures(refetchCase, [restricted(refetchDefaultsRule), parseError])).toEqual([
      expect.stringMatching(/Parsing error: x/),
    ]);
  });

  it('fails on unrelated or misplaced rule reports', () => {
    expect(placementFailures(cleanCase, [restricted(refetchDefaultsRule)])).toHaveLength(1);
    expect(placementFailures(refetchCase, [restricted(queryFreshnessRule)])).toHaveLength(2);
    expect(
      placementFailures(cleanCase, [{ ruleId: 'no-unused-vars', severity: 2, message: 'unused' }])
    ).toHaveLength(1);
  });

  it('reports every failing case and lets lint configuration errors escape', async () => {
    const failures = await checkQueryLintPlacement({
      cases: [refetchCase, cleanCase],
      lintText: async () => [restricted(queryFreshnessRule)],
    });
    expect(failures.map(failure => failure.filePath)).toEqual([
      refetchCase.filePath,
      cleanCase.filePath,
    ]);

    await expect(
      checkQueryLintPlacement({
        cases: [cleanCase],
        lintText: async () => {
          throw new Error('Could not load plugin');
        },
      })
    ).rejects.toThrow(/Could not load plugin/);
  });

  it('covers guarded roots, the queryUtils exception, test files, and outside roots', () => {
    const paths = placementCases.map(testCase => testCase.filePath);

    expect(paths).toEqual(
      expect.arrayContaining([
        'src/hooks/useExample.ts',
        'src/contexts/Example.tsx',
        'src/hooks/queries/shared/queryUtils.ts',
        'src/hooks/__tests__/useExample.test.ts',
        'src/contexts/Example.test.tsx',
        'src/components/Example.tsx',
      ])
    );
  });
});
