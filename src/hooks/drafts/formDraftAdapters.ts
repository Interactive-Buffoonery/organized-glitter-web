import type { CreateArtistData } from '@/hooks/mutations/useArtistMutations';
import type { CreateCompanyData } from '@/hooks/mutations/useCompanyMutations';
import type { ColoringBookFormValues } from '@/schemas/coloring/coloringBook.schema';
import type { ProjectFormValues } from '@/types/project';
import type { Tag } from '@/types/tag';
import { ColoringBooksStatusOptions, ProjectsStatusOptions } from '@/types/pocketbase.types';

type DraftTag = Omit<Tag, 'userId'>;

const projectFields = [
  'id',
  'title',
  'company',
  'artist',
  'status',
  'kitCategory',
  'drillShape',
  'drillType',
  'canvasType',
  'datePurchased',
  'dateStarted',
  'dateCompleted',
  'dateReceived',
  'width',
  'height',
  'totalDiamonds',
  'colorCount',
  'generalNotes',
  'sourceUrl',
  'imageRemoved',
  'tagNames',
  'tagIds',
] as const satisfies ReadonlyArray<keyof ProjectFormValues>;

const coloringFields = [
  'title',
  'totalPages',
  'status',
  'series',
  'theme',
  'isbn',
  'publicationYear',
  'edition',
  'language',
  'sourceUrl',
  'datePurchased',
  'dateReceived',
  'dateStarted',
  'dateCompleted',
  'bookFormat',
  'notes',
  'isMystery',
  'publisher',
  'illustrator',
  'coverImageRemoved',
] as const satisfies ReadonlyArray<keyof ColoringBookFormValues>;

function pickFields<T extends object, K extends keyof T>(
  source: T,
  keys: readonly K[]
): Pick<T, K> {
  return Object.fromEntries(keys.map(key => [key, source[key]])) as Pick<T, K>;
}

const isDraftTag = (tag: unknown): tag is DraftTag => {
  if (!tag || typeof tag !== 'object') return false;
  const candidate = tag as Partial<DraftTag>;
  return ['id', 'name', 'slug', 'color', 'createdAt', 'updatedAt'].every(
    key => typeof candidate[key as keyof DraftTag] === 'string'
  );
};

const hasOnlySafeFields = (fields: object, keys: readonly string[]) => {
  const allowed = new Set(keys);
  return Object.entries(fields).every(
    ([key, value]) =>
      allowed.has(key) &&
      ((key === 'tags' && Array.isArray(value)) ||
        value == null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        ((key === 'tagNames' || key === 'tagIds') &&
          Array.isArray(value) &&
          value.every(item => typeof item === 'string')))
  );
};

const isRestorableStatus = (value: unknown, options: Record<string, string>) =>
  value === undefined ||
  (typeof value === 'string' &&
    value !== 'completed' &&
    value !== 'archived' &&
    value !== 'destashed' &&
    Object.values(options).includes(value));

const withoutTagOwner = (tag: Tag): DraftTag => {
  const { userId: _userId, ...rest } = tag;
  return rest;
};

const withTagOwner = (tag: DraftTag, userId: string): Tag => ({ ...tag, userId });

export interface ProjectDraftValues {
  fields: Omit<ProjectFormValues, 'userId' | 'imageUrl' | 'imageFile' | 'tags'> & {
    tags: DraftTag[];
  };
  hadNewPhoto: boolean;
  statusBeforeDateChange?: ProjectFormValues['status'];
  companies?: CreateCompanyData[];
  artists?: CreateArtistData[];
}

export function projectDraftValues(
  form: ProjectFormValues,
  hadNewPhoto = false,
  metadata?: { companies: Map<string, CreateCompanyData>; artists: Map<string, CreateArtistData> },
  statusBeforeDateChange?: ProjectFormValues['status'] | null
): ProjectDraftValues {
  const { imageFile, tags } = form;
  return {
    fields: { ...pickFields(form, projectFields), tags: (tags ?? []).map(withoutTagOwner) },
    hadNewPhoto: hadNewPhoto || Boolean(imageFile),
    ...(statusBeforeDateChange ? { statusBeforeDateChange } : {}),
    ...(metadata
      ? {
          companies: form.company
            ? ([metadata.companies.get(form.company)].filter(Boolean) as CreateCompanyData[])
            : [],
          artists: form.artist
            ? ([metadata.artists.get(form.artist)].filter(Boolean) as CreateArtistData[])
            : [],
        }
      : {}),
  };
}

export function restoreProjectDraft(
  baseline: ProjectFormValues,
  draft: ProjectDraftValues,
  userId: string
): ProjectFormValues {
  return {
    ...baseline,
    ...pickFields(draft.fields, projectFields),
    tags: draft.fields.tags.map(tag => withTagOwner(tag, userId)),
    imageFile: null,
    imageUrl: draft.fields.imageRemoved ? '' : baseline.imageUrl,
  };
}

export function isProjectDraftValues(value: unknown): value is ProjectDraftValues {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<ProjectDraftValues>;
  return (
    !!draft.fields &&
    hasOnlySafeFields(draft.fields, [...projectFields, 'tags']) &&
    typeof draft.fields.title === 'string' &&
    typeof draft.fields.status === 'string' &&
    Array.isArray(draft.fields.tags) &&
    draft.fields.tags.every(isDraftTag) &&
    typeof draft.hadNewPhoto === 'boolean' &&
    isRestorableStatus(draft.statusBeforeDateChange, ProjectsStatusOptions) &&
    (draft.companies === undefined ||
      (Array.isArray(draft.companies) &&
        draft.companies.every(item => typeof item.name === 'string'))) &&
    (draft.artists === undefined ||
      (Array.isArray(draft.artists) && draft.artists.every(item => typeof item.name === 'string')))
  );
}

export interface ColoringBookDraftValues {
  fields: Omit<ColoringBookFormValues, 'coverImage' | 'tags'> & { tags: DraftTag[] };
  hadNewPhoto: boolean;
  statusBeforeDateChange?: ColoringBookFormValues['status'];
}

export function coloringBookDraftValues(
  values: ColoringBookFormValues,
  hadNewPhoto = false,
  statusBeforeDateChange?: ColoringBookFormValues['status'] | null
): ColoringBookDraftValues {
  const { coverImage, tags } = values;
  return {
    fields: { ...pickFields(values, coloringFields), tags: (tags ?? []).map(withoutTagOwner) },
    hadNewPhoto: hadNewPhoto || Boolean(coverImage),
    ...(statusBeforeDateChange ? { statusBeforeDateChange } : {}),
  };
}

export function restoreColoringBookDraft(
  draft: ColoringBookDraftValues,
  userId: string
): ColoringBookFormValues {
  return {
    ...pickFields(draft.fields, coloringFields),
    tags: draft.fields.tags.map(tag => withTagOwner(tag, userId)),
    coverImage: null,
  };
}

export function isColoringBookDraftValues(value: unknown): value is ColoringBookDraftValues {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<ColoringBookDraftValues>;
  return (
    !!draft.fields &&
    hasOnlySafeFields(draft.fields, [...coloringFields, 'tags']) &&
    typeof draft.fields.title === 'string' &&
    (typeof draft.fields.totalPages === 'number' || draft.fields.totalPages === '') &&
    typeof draft.fields.status === 'string' &&
    Array.isArray(draft.fields.tags) &&
    draft.fields.tags.every(isDraftTag) &&
    typeof draft.hadNewPhoto === 'boolean' &&
    isRestorableStatus(draft.statusBeforeDateChange, ColoringBooksStatusOptions)
  );
}
