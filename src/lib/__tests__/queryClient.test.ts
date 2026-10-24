import { describe, expect, it } from 'vitest';

import { queryClient } from '@/lib/queryClient';

describe('queryClient mutation defaults', () => {
  it('does not retry mutations with ambiguous outcomes', () => {
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(false);
  });
});
