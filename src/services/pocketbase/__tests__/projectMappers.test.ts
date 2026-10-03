import { describe, expect, it } from 'vitest';
import type { ProjectsResponse } from '@/types/pocketbase.types';
import { toExpandedProject, toProjectDTO } from '../projectMappers';

const projectRecord = {
  id: 'project-1',
  user: 'user-1',
  title: 'Night Garden',
  status: 'progress',
  date_purchased: '2025-08-03 00:00:00.000Z',
  date_received: '2025-08-04T00:00:00.000Z',
  date_started: '2025-08-05',
  date_completed: '',
  created: '2025-08-01 12:00:00.000Z',
  updated: '2025-08-02 12:00:00.000Z',
} as ProjectsResponse;

describe('projectMappers date-only fields', () => {
  it('normalizes PocketBase project date fields for DTO consumers', () => {
    const project = toProjectDTO(projectRecord);

    expect(project.datePurchased).toBe('2025-08-03');
    expect(project.dateReceived).toBe('2025-08-04');
    expect(project.dateStarted).toBe('2025-08-05');
    expect(project.dateCompleted).toBe('');
  });

  it('normalizes PocketBase project date fields for expanded project consumers', () => {
    const project = toExpandedProject(projectRecord);

    expect(project.datePurchased).toBe('2025-08-03');
    expect(project.dateReceived).toBe('2025-08-04');
    expect(project.dateStarted).toBe('2025-08-05');
    expect(project.dateCompleted).toBeUndefined();
    expect(project.createdAt).toBe('2025-08-01 12:00:00.000Z');
  });
});
