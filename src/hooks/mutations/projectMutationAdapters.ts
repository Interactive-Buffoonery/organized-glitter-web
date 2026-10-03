import type { ProjectUpdateData } from '@/types/file-upload';
import { formatDateForStorage } from '@/utils/date/dateFormatting';
import { resolveCompanyAndArtistIds } from '@/utils/project/field-mapping';
import { buildFormDataForUpdate } from '@/utils/project/formdata-builder';
import { clearOptionalRelation } from '@/services/pocketbase/relationClear';

import type { CreateProjectInput, UpdateProjectInput } from './projectCommands';

const appendIfPresent = (
  formData: FormData,
  key: string,
  value: string | number | null | undefined
) => {
  if (value === undefined || value === null || value === '') return;
  formData.append(key, String(value));
};

export const buildCreateProjectFormData = async (input: CreateProjectInput): Promise<FormData> => {
  const { companyId, artistId } = await resolveCompanyAndArtistIds(
    input.companyName ?? undefined,
    input.artistName ?? undefined,
    input.userId
  );

  const formData = new FormData();

  appendIfPresent(formData, 'title', input.title);
  appendIfPresent(formData, 'user', input.userId);
  appendIfPresent(formData, 'status', input.status ?? 'wishlist');
  appendIfPresent(formData, 'kit_category', input.kitCategory ?? 'full');
  appendIfPresent(formData, 'drill_shape', input.drillShape);
  appendIfPresent(formData, 'date_purchased', formatDateForStorage(input.datePurchased));
  appendIfPresent(formData, 'date_started', formatDateForStorage(input.dateStarted));
  appendIfPresent(formData, 'date_completed', formatDateForStorage(input.dateCompleted));
  appendIfPresent(formData, 'date_received', formatDateForStorage(input.dateReceived));
  appendIfPresent(formData, 'width', input.width);
  appendIfPresent(formData, 'height', input.height);
  appendIfPresent(formData, 'total_diamonds', input.totalDiamonds);
  appendIfPresent(formData, 'color_count', input.colorCount);
  appendIfPresent(formData, 'general_notes', input.generalNotes);
  appendIfPresent(formData, 'source_url', input.sourceUrl);

  if (companyId) {
    formData.append('company', companyId);
  }

  if (artistId) {
    formData.append('artist', artistId);
  }

  if (input.imageFile) {
    formData.append('image', input.imageFile);
  }

  return formData;
};

export const buildUpdateProjectFormData = async (
  input: UpdateProjectInput,
  userId: string,
  userTimezone?: string
): Promise<FormData> => {
  const expectedRevision = input.expectedRevision;
  if (
    input.tagIds !== undefined &&
    (expectedRevision === undefined ||
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision < 0)
  ) {
    throw Object.assign(new Error('Project tag edits require a valid expected revision.'), {
      reason: 'invalid_expected_revision' as const,
    });
  }

  const updateData: ProjectUpdateData = {
    title: input.title,
    status: input.status,
    kit_category: input.kitCategory,
    drill_shape: input.drillShape,
    date_purchased: formatDateForStorage(input.datePurchased, userTimezone),
    date_started: formatDateForStorage(input.dateStarted, userTimezone),
    date_completed: formatDateForStorage(input.dateCompleted, userTimezone),
    date_received: formatDateForStorage(input.dateReceived, userTimezone),
    width: input.width,
    height: input.height,
    total_diamonds: input.totalDiamonds,
    color_count: input.colorCount,
    general_notes: input.generalNotes,
    source_url: input.sourceUrl,
  };

  const { companyId, artistId } = await resolveCompanyAndArtistIds(
    input.companyName ?? undefined,
    input.artistName ?? undefined,
    userId
  );

  if (companyId) {
    updateData.company = companyId;
  }

  if (artistId) {
    updateData.artist = artistId;
  }

  const formData = buildFormDataForUpdate(
    updateData,
    input.imageFile ?? undefined,
    input.imageRemoved
  );

  // Project updates use one tri-state contract: undefined omits the field, null
  // clears it, and a concrete value replaces it. PocketBase receives clears as
  // empty multipart values because the shared base builder intentionally omits null.
  const clearFieldMap: Array<[keyof UpdateProjectInput, string]> = [
    ['companyName', 'company'],
    ['artistName', 'artist'],
    ['drillShape', 'drill_shape'],
    ['datePurchased', 'date_purchased'],
    ['dateStarted', 'date_started'],
    ['dateCompleted', 'date_completed'],
    ['dateReceived', 'date_received'],
    ['width', 'width'],
    ['height', 'height'],
    ['totalDiamonds', 'total_diamonds'],
    ['colorCount', 'color_count'],
    ['generalNotes', 'general_notes'],
    ['sourceUrl', 'source_url'],
  ];
  for (const [inputKey, fieldName] of clearFieldMap) {
    if (input[inputKey] === null) {
      formData.set(fieldName, '');
    }
  }

  // Retain the existing empty-string relation contract for section-level
  // mutations that do not pass through the full-form command mapper.
  if (input.companyName === '') {
    formData.set('company', clearOptionalRelation());
  }

  if (input.artistName === '') {
    formData.set('artist', clearOptionalRelation());
  }

  if (input.tagIds !== undefined) {
    formData.set('og_tag_ids', JSON.stringify(input.tagIds));
  }

  return formData;
};
