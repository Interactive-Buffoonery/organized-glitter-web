export const tagNameKey = (name: string) => name.trim().toLowerCase();

export function planImportTags(
  existingTags: { id: string; name: string }[],
  csvTagNames: string[],
  normalize: (name: string) => string = name => name
) {
  const tagIds = new Map<string, string>();
  for (const tag of existingTags) {
    tagIds.set(tagNameKey(tag.name), tag.id);
    tagIds.set(tagNameKey(normalize(tag.name)), tag.id);
  }

  const namesToCreate = new Map<string, string>();
  for (const csvName of csvTagNames) {
    const name = normalize(csvName).trim();
    const key = tagNameKey(name);
    if (key && !tagIds.has(key) && !namesToCreate.has(key)) namesToCreate.set(key, name);
  }

  return { tagIds, namesToCreate: [...namesToCreate.values()] };
}

export const findTagByName = <T extends { name: string }>(tags: T[], name: string) =>
  tags.find(tag => tagNameKey(tag.name) === tagNameKey(name));
