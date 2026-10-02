const MAX_ERROR_DEPTH = 4;
const REASON_CODE_PATTERN = /^[a-z][a-z0-9_]{0,127}$/;

const normalizeReason = (value: unknown): string | undefined => {
  const rawReason =
    typeof value === 'string'
      ? value
      : typeof value === 'object' && value !== null && 'code' in value
        ? value.code
        : undefined;
  if (typeof rawReason !== 'string') return undefined;

  const reason = rawReason.trim();
  return REASON_CODE_PATTERN.test(reason) ? reason : undefined;
};

export const getStructuredErrorReason = (error: unknown): string | undefined => {
  const visited = new Set<object>();

  const visit = (value: unknown, depth: number): string | undefined => {
    if (depth > MAX_ERROR_DEPTH || typeof value !== 'object' || value === null) return undefined;
    if (visited.has(value)) return undefined;
    visited.add(value);

    const candidate = value as Record<string, unknown>;
    const reason = normalizeReason(candidate.reason);
    if (reason) return reason;

    return visit(candidate.data, depth + 1) ?? visit(candidate.cause, depth + 1);
  };

  return visit(error, 0);
};
