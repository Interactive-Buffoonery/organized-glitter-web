import { describe, expect, it } from 'vitest';
import type { ProjectType } from '@/types/project';
import { getLifecycleDate } from '../projectsTableUtils';

const baseProject: ProjectType = {
  id: 'project1234567',
  userId: 'user123456789',
  title: 'Calendar Project',
  status: 'purchased',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('getLifecycleDate', () => {
  it('formats project date-only metadata without shifting to the previous day', () => {
    expect(getLifecycleDate({ ...baseProject, datePurchased: '2026-05-08' })).toEqual({
      label: 'Purchased',
      value: '5/8/2026',
    });
  });
});
