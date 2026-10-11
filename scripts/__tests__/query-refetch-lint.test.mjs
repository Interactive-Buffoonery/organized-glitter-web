import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

const eslint = new ESLint();

const lint = async (code, filePath) => {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter(message => message.ruleId === 'no-restricted-syntax');
};

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

  it.each(cases)('%s rejects %s: false', async (filePath, key) => {
    expect(await lint(`export const options = { ${key}: false };`, filePath)).toHaveLength(1);
  });

  it('allows inherited defaults and explicit enabled refetching', async () => {
    const messages = await lint(
      'export const options = { refetchOnWindowFocus: true, refetchOnMount: "always" };',
      'src/hooks/useExample.ts'
    );
    expect(messages).toHaveLength(0);
  });
});
