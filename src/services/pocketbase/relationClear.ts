export const POCKETBASE_RELATION_CLEAR_VALUE = '';

export function normalizeOptionalRelation(value: string | null | undefined): string | undefined {
  return value ? value : undefined;
}

export function clearOptionalRelation(): string {
  return POCKETBASE_RELATION_CLEAR_VALUE;
}
