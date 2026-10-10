export const TAG_NAME_MAX_LENGTH = 100;

export function validateTagName(value: string): string | undefined {
  const name = value.trim();
  if (!name) return 'Tag name cannot be empty';
  if (name.length > TAG_NAME_MAX_LENGTH) return 'Tag name must be 100 characters or less';
  return undefined;
}
