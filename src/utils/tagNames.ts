import {
  createSuccessResponse,
  isServiceResponseError,
  type ServiceResponse,
} from '@/types/shared';

type NamedTag = { id: string; name: string };

// Keep in step with tagNameKey in pb_hooks/tag_names.js.
export const tagNameKey = (name: string) => name.normalize('NFC').trim().toLowerCase();

const byNameThenId = (a: NamedTag, b: NamedTag) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

// Exact spelling wins, so legacy pairs like `cats` and `Cats` each keep their own tag.
export function findTagByName<T extends NamedTag>(tags: T[], name: string): T | undefined {
  const raw = name.trim();
  const composed = raw.normalize('NFC');
  const sameSpelling =
    tags.find(tag => tag.name.trim() === raw) ??
    tags.find(tag => tag.name.trim().normalize('NFC') === composed);
  if (sameSpelling) return sameSpelling;
  const key = tagNameKey(name);
  return tags.filter(tag => tagNameKey(tag.name) === key).sort(byNameThenId)[0];
}

export function planImportTags(
  existingTags: NamedTag[],
  csvTagNames: string[],
  normalize: (name: string) => string = name => name
) {
  const known = existingTags.flatMap(tag => [tag, { id: tag.id, name: normalize(tag.name) }]);
  const resolveTagId = (name: string) => findTagByName(known, normalize(name))?.id;

  const namesToCreate = new Map<string, string>();
  for (const csvName of csvTagNames) {
    const name = normalize(csvName).trim();
    const key = tagNameKey(name);
    if (key && !resolveTagId(csvName) && !namesToCreate.has(key)) namesToCreate.set(key, name);
  }

  return {
    resolveTagId,
    addTag: (tag: NamedTag) => known.push(tag),
    namesToCreate: [...namesToCreate.values()],
  };
}

// There is no unique index, so a same-moment create elsewhere can win; reuse that tag.
export async function createTagOrReuseMatch<T extends NamedTag>(
  name: string,
  create: () => Promise<ServiceResponse<T>>,
  listTags: () => Promise<ServiceResponse<T[]>>
): Promise<ServiceResponse<T>> {
  const created = await create();
  if (!isServiceResponseError(created)) return created;
  const latest = await listTags();
  const match = isServiceResponseError(latest) ? undefined : findTagByName(latest.data, name);
  return match ? createSuccessResponse(match) : created;
}

export async function resolveTagIds<T extends NamedTag>(
  names: string[],
  listTags: () => Promise<ServiceResponse<T[]>>,
  create: (tagData: { name: string }) => Promise<ServiceResponse<T>>,
  beforeCreate: () => void = () => {}
): Promise<string[]> {
  const existing = await listTags();
  if (isServiceResponseError(existing)) throw existing.error;
  const known: NamedTag[] = [...existing.data];
  const ids = new Set<string>();

  for (const tagName of names) {
    const name = tagName.trim();
    if (!name) continue;
    const match = findTagByName(known, name);
    if (match) {
      ids.add(match.id);
      continue;
    }

    beforeCreate();
    const created = await createTagOrReuseMatch(name, () => create({ name }), listTags);
    if (isServiceResponseError(created)) throw created.error;
    known.push(created.data);
    ids.add(created.data.id);
  }

  return [...ids];
}
