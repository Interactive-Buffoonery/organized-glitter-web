import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolverMock = vi.hoisted(() => ({
  resolveCompanyAndArtistIds: vi.fn(),
}));

vi.mock('@/utils/project/field-mapping', () => resolverMock);

import { buildUpdateProjectFormData } from '../projectMutationAdapters';

describe('project mutation relation payloads', () => {
  beforeEach(() => {
    resolverMock.resolveCompanyAndArtistIds.mockReset().mockResolvedValue({
      companyId: null,
      artistId: null,
    });
  });

  it('writes explicit clear instructions for every optional full-form field', async () => {
    const formData = await buildUpdateProjectFormData(
      {
        projectId: 'project-1',
        title: 'Project',
        companyName: null,
        artistName: null,
        drillShape: null,
        datePurchased: null,
        dateStarted: null,
        dateCompleted: null,
        dateReceived: null,
        width: null,
        height: null,
        totalDiamonds: null,
        colorCount: null,
        generalNotes: null,
        sourceUrl: null,
      },
      'user-123'
    );

    expect(Object.fromEntries(formData.entries())).toMatchObject({
      company: '',
      artist: '',
      drill_shape: '',
      date_purchased: '',
      date_started: '',
      date_completed: '',
      date_received: '',
      width: '',
      height: '',
      total_diamonds: '',
      color_count: '',
      general_notes: '',
      source_url: '',
    });
  });

  it('omits undefined fields so partial updates leave stored values unchanged', async () => {
    const formData = await buildUpdateProjectFormData(
      {
        projectId: 'project-1',
        title: 'Project',
      },
      'user-123'
    );

    expect([...formData.keys()]).toEqual(['title']);
  });

  it('rejects requested tag edits without a revision before resolving relations', async () => {
    await expect(
      buildUpdateProjectFormData(
        {
          projectId: 'project-1',
          title: 'Project',
          companyName: 'New company',
          tagIds: ['abc123def456ghi'],
        },
        'user-123'
      )
    ).rejects.toMatchObject({ reason: 'invalid_expected_revision' });

    expect(resolverMock.resolveCompanyAndArtistIds).not.toHaveBeenCalled();
  });
});
