import { describe, expect, it } from 'vitest';
import { Linter } from 'eslint';

import { queryLintConfigs, refetchDefaultsRule } from '../../config/eslint-query-rules.js';

// These use only the shared query rule blocks from eslint.config.js. Loading the full config and
// its plugins takes seconds, so scripts/check-query-lint-placement.mjs checks the real config's
// file placement in the static phase.
const linter = new Linter();
const config = [
  { files: ['**/*.{ts,tsx}'], languageOptions: { sourceType: 'module' } },
  ...queryLintConfigs,
];

const lint = (code, filePath) => linter.verify(code, config, { filename: filePath });

describe('refetch defaults lint guard', () => {
  const cases = [
    'src/hooks/useExample.ts',
    'src/contexts/Example.tsx',
    'src/hooks/queries/shared/queryUtils.ts',
  ].flatMap(filePath =>
    ['refetchOnWindowFocus', 'refetchOnReconnect', 'refetchOnMount'].flatMap(property =>
      [property, `'${property}'`, `['${property}']`].map(key => [filePath, key])
    )
  );

  it.each(cases)('%s rejects %s: false', (filePath, key) => {
    expect(lint(`export const options = { ${key}: false };`, filePath)).toEqual([
      expect.objectContaining({
        ruleId: 'no-restricted-syntax',
        severity: 2,
        message: refetchDefaultsRule.message,
      }),
    ]);
  });

  it('allows inherited defaults and explicit enabled refetching', () => {
    const messages = lint(
      'export const options = { refetchOnWindowFocus: true, refetchOnMount: "always" };',
      'src/hooks/useExample.ts'
    );
    expect(messages).toEqual([]);
  });
});
