import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/hooks/queries/queryKeys';
import { invalidateNotesFeedQueries } from '@/hooks/queries/notesFeedCache';

type ProjectListItem = { id: string; [key: string]: unknown };
type ProjectListCache = {
  projects: ProjectListItem[];
  totalItems?: number;
  [key: string]: unknown;
};

type ProjectDetailCache = {
  id: string;
  [key: string]: unknown;
};

const isProjectListCache = (value: unknown): value is ProjectListCache => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'projects' in value &&
    Array.isArray((value as ProjectListCache).projects)
  );
};

const isProjectDetailCache = (value: unknown): value is ProjectDetailCache => {
  return typeof value === 'object' && value !== null && 'id' in value;
};

export const patchProjectDetail = (cachedValue: unknown, patch: Partial<ProjectDetailCache>) => {
  if (!isProjectDetailCache(cachedValue)) return cachedValue;
  return { ...cachedValue, ...patch };
};

export const patchProjectInLists = (
  cachedValue: unknown,
  projectId: string,
  patch: Partial<ProjectListItem>
) => {
  if (!isProjectListCache(cachedValue)) return cachedValue;

  let didChange = false;
  const projects = cachedValue.projects.map(project => {
    if (project.id !== projectId) return project;
    didChange = true;
    return { ...project, ...patch };
  });

  return didChange ? { ...cachedValue, projects } : cachedValue;
};

export const removeProjectFromLists = (cachedValue: unknown, projectId: string) => {
  if (!isProjectListCache(cachedValue)) return cachedValue;

  const projects = cachedValue.projects.filter(project => project.id !== projectId);
  if (projects.length === cachedValue.projects.length) return cachedValue;

  return {
    ...cachedValue,
    projects,
    totalItems:
      typeof cachedValue.totalItems === 'number'
        ? Math.max(0, cachedValue.totalItems - 1)
        : cachedValue.totalItems,
  };
};

export const invalidateProjectDetailAndProgressNotes = (
  queryClient: QueryClient,
  projectId: string
) => {
  return Promise.allSettled([
    queryClient.invalidateQueries({
      queryKey: queryKeys.projects.detail(projectId),
      exact: true,
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.progressNotes.lists(),
    }),
    invalidateNotesFeedQueries(queryClient),
  ]);
};
