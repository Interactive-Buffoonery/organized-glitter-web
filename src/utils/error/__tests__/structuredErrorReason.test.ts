import { describe, expect, it } from 'vitest';
import { getStructuredErrorReason } from '../structuredErrorReason';

describe('getStructuredErrorReason', () => {
  it('extracts a reason code through a service error cause', () => {
    expect(
      getStructuredErrorReason({
        type: 'validation',
        cause: {
          data: {
            data: {
              reason: { code: 'verification_busy', message: 'Private detail' },
            },
          },
        },
      })
    ).toBe('verification_busy');
  });

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

  it('rejects a cyclic reason code object', () => {
    const reason: { code?: unknown } = {};
    reason.code = reason;
    expect(getStructuredErrorReason({ reason })).toBeUndefined();
  });
});
