import { describe, expect, it } from 'vitest';
import { getStructuredErrorReason } from '../structuredErrorReason';

describe('getStructuredErrorReason', () => {
  it('stops at cycles and bounded nesting', () => {
    const cyclic: { cause?: unknown } = {};
    cyclic.cause = cyclic;
    expect(getStructuredErrorReason(cyclic)).toBeUndefined();

    expect(
      getStructuredErrorReason({
        cause: { cause: { cause: { cause: { cause: { reason: 'too_deep' } } } } },
      })
    ).toBeUndefined();
  });

  it('rejects prose instead of exposing it as a reason code', () => {
    expect(getStructuredErrorReason({ reason: 'Private backend detail' })).toBeUndefined();
  });
});
