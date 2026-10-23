#!/usr/bin/env node
// Check that the real ESLint configuration applies the query option rules to the right files.
// Loading the full configuration and its plugins takes seconds, so this runs in the static phase
// (test:ci:static).
import { ESLint } from 'eslint';
import { pathToFileURL } from 'node:url';

import { queryFreshnessRule, refetchDefaultsRule } from '../config/eslint-query-rules.js';

const refetchDisabled = 'export const options = { refetchOnWindowFocus: false };';
const freshnessSet = 'export const options = { staleTime: 1000 };';

export const placementCases = [
  { filePath: 'src/hooks/useExample.ts', code: refetchDisabled, expected: [refetchDefaultsRule] },
  { filePath: 'src/hooks/useExample.ts', code: freshnessSet, expected: [queryFreshnessRule] },
  { filePath: 'src/contexts/Example.tsx', code: refetchDisabled, expected: [refetchDefaultsRule] },
  { filePath: 'src/contexts/Example.tsx', code: freshnessSet, expected: [queryFreshnessRule] },
  {
    filePath: 'src/hooks/queries/shared/queryUtils.ts',
    code: refetchDisabled,
    expected: [refetchDefaultsRule],
  },
  { filePath: 'src/hooks/queries/shared/queryUtils.ts', code: freshnessSet, expected: [] },
  { filePath: 'src/hooks/__tests__/useExample.test.ts', code: refetchDisabled, expected: [] },
  { filePath: 'src/hooks/__tests__/useExample.ts', code: freshnessSet, expected: [] },
  { filePath: 'src/contexts/Example.test.tsx', code: refetchDisabled, expected: [] },
  { filePath: 'src/components/Example.tsx', code: refetchDisabled, expected: [] },
  { filePath: 'src/services/example.ts', code: freshnessSet, expected: [] },
];

const describeMessage = message =>
  `${message.ruleId ?? (message.fatal ? 'fatal' : 'no rule')}: ${message.message}`;

/** Every message must be one of the expected rule reports; anything else fails. */
export function placementFailures({ expected }, messages) {
  const failures = [];
  const unmatched = [...expected];
  for (const message of messages) {
    const index = unmatched.findIndex(
      rule =>
        message.ruleId === 'no-restricted-syntax' &&
        message.severity === 2 &&
        message.message === rule.message
    );
    if (index >= 0) unmatched.splice(index, 1);
    else failures.push(`unexpected ${describeMessage(message)}`);
  }
  for (const rule of unmatched) failures.push(`missing no-restricted-syntax: ${rule.message}`);
  return failures;
}

export async function checkQueryLintPlacement({ cases = placementCases, lintText }) {
  const results = [];
  for (const testCase of cases) {
    const failures = placementFailures(testCase, await lintText(testCase.code, testCase.filePath));
    if (failures.length > 0)
      results.push({ filePath: testCase.filePath, code: testCase.code, failures });
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const eslint = new ESLint();
  const failures = await checkQueryLintPlacement({
    lintText: async (code, filePath) => {
      const [result] = await eslint.lintText(code, { filePath, warnIgnored: true });
      return result.messages;
    },
  });
  for (const { filePath, code, failures: messages } of failures) {
    console.error(`${filePath}: ${code}\n  ${messages.join('\n  ')}`);
  }
  if (failures.length > 0) process.exitCode = 1;
  else console.log(`Query lint rules apply as expected to ${placementCases.length} cases.`);
}
