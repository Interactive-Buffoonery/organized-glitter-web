import type { ProjectsResponse } from '@/types/pocketbase.types';
import type { Project, ProjectStatus } from '@/types/project';
import type { ProjectDTO } from '@/services/types';
import { normalizeDateOnlyValue } from '@/utils/date/timezoneUtils';

export function toProjectDTO(record: ProjectsResponse): ProjectDTO {
  return {
    id: record.id,
    userId: record.user,
    title: record.title || '',
    companyId: record.company || '',
    artistId: record.artist || '',
    status: record.status || 'wishlist',
    kitCategory: record.kit_category || '',
    drillShape: record.drill_shape || '',
    datePurchased: normalizeDateOnlyValue(record.date_purchased),
    dateReceived: normalizeDateOnlyValue(record.date_received),
    dateStarted: normalizeDateOnlyValue(record.date_started),
    dateCompleted: normalizeDateOnlyValue(record.date_completed),
    width: record.width || undefined,
    height: record.height || undefined,
    totalDiamonds: record.total_diamonds || undefined,
    colorCount: record.color_count || undefined,
    generalNotes: record.general_notes || '',
    image: record.image || '',
    sourceUrl: record.source_url || '',
    createdAt: record.created || '',
    updatedAt: record.updated || '',
    revision: record.revision ?? 0,
  };
}

function mapExpandedTags(recordExpand: Record<string, unknown> | undefined): Project['tags'] {
  const projectTags = recordExpand?.['project_tags_via_project'];

  return Array.isArray(projectTags)
    ? projectTags
        .map((pt: Record<string, unknown>) => {
          const ptExpand = pt.expand as Record<string, unknown>;
          if (ptExpand?.tag) {
            const tag = ptExpand.tag as Record<string, unknown>;
            return {
              id: tag.id as string,
              userId: tag.user as string,
              name: tag.name as string,
              slug: tag.slug as string,
              color: tag.color as string,
              createdAt: tag.created as string,
              updatedAt: tag.updated as string,
            };
          }
          return null;
        })
        .filter((tag): tag is NonNullable<typeof tag> => tag !== null)
    : [];
}

function toProjectBase(record: ProjectsResponse): Omit<Project, 'company' | 'artist' | 'tags'> {
  return {
    id: record.id,
    userId: record.user,
    title: record.title || '',
    status: (record.status as ProjectStatus) || 'wishlist',
    kitCategory: record.kit_category || undefined,
    drillShape: record.drill_shape || undefined,
    datePurchased: normalizeDateOnlyValue(record.date_purchased) || undefined,
    dateReceived: normalizeDateOnlyValue(record.date_received) || undefined,
    dateStarted: normalizeDateOnlyValue(record.date_started) || undefined,
    dateCompleted: normalizeDateOnlyValue(record.date_completed) || undefined,
    width: record.width || undefined,
    height: record.height || undefined,
    totalDiamonds: record.total_diamonds || undefined,
    colorCount: record.color_count || undefined,
    generalNotes: record.general_notes || '',
    imageUrl: record.image || undefined,
    sourceUrl: record.source_url || undefined,
    createdAt: record.created || '',
    updatedAt: record.updated || '',
    revision: record.revision ?? 0,
  };
}

export function toProject(
  record: ProjectsResponse,
  companyMap?: Map<string, string>,
  artistMap?: Map<string, string>
): Project {
  const recordExpand = record.expand as Record<string, unknown> | undefined;

  return {
    ...toProjectBase(record),
    company: record.company ? companyMap?.get(record.company) : undefined,
    artist: record.artist ? artistMap?.get(record.artist) : undefined,
    tags: mapExpandedTags(recordExpand),
  };
}

export function toExpandedProject(record: ProjectsResponse): Project {
  const recordExpand = record.expand as Record<string, unknown> | undefined;
  const companyExpand = recordExpand?.company as Record<string, unknown> | undefined;
  const artistExpand = recordExpand?.artist as Record<string, unknown> | undefined;

  return {
    ...toProjectBase(record),
    company: (companyExpand?.name as string) || undefined,
    artist: (artistExpand?.name as string) || undefined,
    tags: mapExpandedTags(recordExpand),
  };
}
