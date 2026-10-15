// Query option lint rules shared by eslint.config.js and the tests that check them, so both use
// one definition.

export const queryFreshnessRule = {
  selector: 'Property[key.name=/^(staleTime|gcTime)$/], Property[key.value=/^(staleTime|gcTime)$/]',
  message:
    "Spread queryFreshness('<profile>') from '@/hooks/queries/shared/queryUtils' instead of setting staleTime or gcTime.",
};

export const refetchDefaultsRule = {
  selector:
    'Property[key.name=/^(refetchOnWindowFocus|refetchOnReconnect|refetchOnMount)$/][value.value=false], Property[key.value=/^(refetchOnWindowFocus|refetchOnReconnect|refetchOnMount)$/][value.value=false]',
  message:
    'Focus, reconnect, and mount refetching keep data fresh across devices (ADR-0004). Keep the query client defaults.',
};

const queryUtilsFile = 'src/hooks/queries/shared/queryUtils.ts';
const testFiles = ['**/__tests__/**', '**/*.test.{ts,tsx}'];

export const queryLintConfigs = [
  {
    files: ['src/hooks/**/*.{ts,tsx}', 'src/contexts/**/*.{ts,tsx}'],
    ignores: [...testFiles, queryUtilsFile],
    rules: {
      'no-restricted-syntax': ['error', queryFreshnessRule, refetchDefaultsRule],
    },
  },
  {
    files: [queryUtilsFile],
    ignores: testFiles,
    rules: {
      'no-restricted-syntax': ['error', refetchDefaultsRule],
    },
  },
];
