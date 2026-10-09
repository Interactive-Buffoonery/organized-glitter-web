import assert from 'node:assert/strict';
import test from 'node:test';
import { ESLint } from 'eslint';

const eslint = new ESLint();
const properties = ['refetchOnWindowFocus', 'refetchOnReconnect', 'refetchOnMount'];

for (const filePath of [
  'src/hooks/useExample.ts',
  'src/contexts/Example.tsx',
  'src/hooks/queries/shared/queryUtils.ts',
]) {
  for (const property of properties) {
    for (const key of [property, `'${property}'`, `['${property}']`]) {
      test(`${filePath} rejects ${key}: false`, async () => {
        const [result] = await eslint.lintText(`export const options = { ${key}: false };`, {
          filePath,
        });
        assert.equal(
          result.messages.filter(message => message.ruleId === 'no-restricted-syntax').length,
          1
        );
      });
    }
  }
}

test('allows inherited defaults and explicit enabled refetching', async () => {
  const [result] = await eslint.lintText(
    'export const options = { refetchOnWindowFocus: true, refetchOnMount: "always" };',
    { filePath: 'src/hooks/useExample.ts' }
  );
  assert.equal(result.errorCount, 0);
});
