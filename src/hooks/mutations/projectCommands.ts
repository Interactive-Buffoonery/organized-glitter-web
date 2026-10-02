import type { ProjectFormValues, ProjectStatus } from '@/types/project';

type ProjectCommandFields = {
  title?: string;
  companyName?: string | null;
  artistName?: string | null;
  status?: ProjectStatus;
  kitCategory?: 'full' | 'mini';
  drillShape?: string | null;
  datePurchased?: string | null;
  dateStarted?: string | null;
  dateCompleted?: string | null;
  dateReceived?: string | null;
  width?: number | null;
  height?: number | null;
  totalDiamonds?: number | null;
  colorCount?: number | null;
  generalNotes?: string | null;
  sourceUrl?: string | null;
};

export interface CreateProjectInput extends ProjectCommandFields {
  title: string;
  userId: string;
  imageFile?: File | null;
  tagIds?: string[];
}

export interface UpdateProjectInput extends ProjectCommandFields {
  projectId: string;
  expectedRevision?: number;
  tagIds?: string[];
  imageFile?: File | null;
  imageRemoved?: boolean;
}

export type DateFieldKey = 'datePurchased' | 'dateReceived' | 'dateStarted' | 'dateCompleted';

export interface UpdateProjectDatesSectionInput {
  projectId: string;
  datePurchased?: string | null;
  dateStarted?: string | null;
  dateCompleted?: string | null;
  dateReceived?: string | null;
}

export interface UpdateProjectNotesSectionInput {
  projectId: string;
  notes: string;
}

export interface ChangeProjectStatusInput {
  projectId: string;
  nextStatus: ProjectStatus;
  currentStatus?: ProjectStatus;
}

const normalizeCreateString = (value: string | null | undefined): string | undefined => {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const normalizeUpdateString = (value: string | null | undefined): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const normalizeCreateNumber = (
  value: string | number | null | undefined
): number | null | undefined => {
  if (value == null || value === '') return undefined;
  if (typeof value === 'number') return Number.isNaN(value) ? null : value;

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizeUpdateNumber = (
  value: string | number | null | undefined
): number | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value === 'number') return Number.isNaN(value) ? null : value;

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const mapCreateProjectFormFields = (formData: ProjectFormValues): ProjectCommandFields => ({
  title: formData.title.trim(),
  companyName: normalizeCreateString(formData.company),
  artistName: normalizeCreateString(formData.artist),
  status: formData.status,
  kitCategory: formData.kitCategory,
  drillShape: normalizeCreateString(formData.drillShape),
  datePurchased: normalizeCreateString(formData.datePurchased),
  dateStarted: normalizeCreateString(formData.dateStarted),
  dateCompleted: normalizeCreateString(formData.dateCompleted),
  dateReceived: normalizeCreateString(formData.dateReceived),
  width: normalizeCreateNumber(formData.width),
  height: normalizeCreateNumber(formData.height),
  totalDiamonds: normalizeCreateNumber(formData.totalDiamonds),
  colorCount: normalizeCreateNumber(formData.colorCount),
  generalNotes: normalizeCreateString(formData.generalNotes),
  sourceUrl: normalizeCreateString(formData.sourceUrl),
});

const mapUpdateProjectFormFields = (formData: ProjectFormValues): ProjectCommandFields => ({
  title: formData.title.trim(),
  companyName: normalizeUpdateString(formData.company),
  artistName: normalizeUpdateString(formData.artist),
  status: formData.status,
  kitCategory: formData.kitCategory,
  drillShape: normalizeUpdateString(formData.drillShape),
  datePurchased: normalizeUpdateString(formData.datePurchased),
  dateStarted: normalizeUpdateString(formData.dateStarted),
  dateCompleted: normalizeUpdateString(formData.dateCompleted),
  dateReceived: normalizeUpdateString(formData.dateReceived),
  width: normalizeUpdateNumber(formData.width),
  height: normalizeUpdateNumber(formData.height),
  totalDiamonds: normalizeUpdateNumber(formData.totalDiamonds),
  colorCount: normalizeUpdateNumber(formData.colorCount),
  generalNotes: normalizeUpdateString(formData.generalNotes),
  sourceUrl: normalizeUpdateString(formData.sourceUrl),
});

export const toCreateProjectInput = (
  formData: ProjectFormValues,
  userId: string
): CreateProjectInput => ({
  title: formData.title.trim(),
  userId,
  ...mapCreateProjectFormFields(formData),
  imageFile: formData.imageFile ?? null,
  tagIds: formData.tags?.map(tag => tag.id) ?? formData.tagIds ?? [],
});

export const toUpdateProjectInput = (
  projectId: string,
  formData: ProjectFormValues
): UpdateProjectInput => ({
  projectId,
  ...mapUpdateProjectFormFields(formData),
  imageFile: formData.imageFile,
  imageRemoved: formData.imageRemoved,
});
