import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolverMock = vi.hoisted(() => ({
  resolveCompanyAndArtistIds: vi.fn(),
}));

vi.mock('@/utils/project/field-mapping', () => resolverMock);

import { buildCreateProjectFormData, buildUpdateProjectFormData } from '../projectMutationAdapters';

describe('project mutation relation payloads', () => {
  beforeEach(() => {
    resolverMock.resolveCompanyAndArtistIds.mockReset().mockResolvedValue({
      companyId: null,
      artistId: null,
    });
  });

  it('omits empty company and artist relations on create', async () => {
    const formData = await buildCreateProjectFormData({
      title: 'Project',
      userId: 'user-123',
      companyName: '',
      artistName: '',
    });

    expect(formData.has('company')).toBe(false);
    expect(formData.has('artist')).toBe(false);
  });

  it('writes resolved relation IDs for ID-looking names on create', async () => {
    resolverMock.resolveCompanyAndArtistIds.mockResolvedValueOnce({
      companyId: 'abc123def456ghi',
      artistId: 'jkl789mno012pqr',
    });

    const formData = await buildCreateProjectFormData({
      title: 'Project',
      userId: 'user-123',
      companyName: 'DiamondArtStudio',
      artistName: 'GoldenBrushArtsX',
    });

    expect(resolverMock.resolveCompanyAndArtistIds).toHaveBeenCalledWith(
      'DiamondArtStudio',
      'GoldenBrushArtsX',
      'user-123'
    );
    expect(formData.get('company')).toBe('abc123def456ghi');
    expect(formData.get('artist')).toBe('jkl789mno012pqr');
  });

  it('does not synthesize a completed date when creating a completed project', async () => {
    const formData = await buildCreateProjectFormData({
      title: 'Project',
      userId: 'user-123',
      status: 'completed',
    });

    expect(formData.get('status')).toBe('completed');
    expect(formData.has('date_completed')).toBe(false);
  });

  it('preserves an explicit completed date when creating a completed project', async () => {
    const formData = await buildCreateProjectFormData({
      title: 'Project',
      userId: 'user-123',
      status: 'completed',
      dateCompleted: '2026-05-17',
    });

    expect(formData.get('status')).toBe('completed');
    expect(formData.get('date_completed')).toBe('2026-05-17');
  });

  it('includes color count when creating a project', async () => {
    const formData = await buildCreateProjectFormData({
      title: 'Project',
      userId: 'user-123',
      colorCount: 48,
    });

    expect(formData.get('color_count')).toBe('48');
  });

  it('includes the cover image in the initial project create payload', async () => {
    const cover = new File(['cover'], 'cover.jpg', { type: 'image/jpeg' });

    const formData = await buildCreateProjectFormData({
      title: 'Project',
      userId: 'user-123',
      imageFile: cover,
    });

    expect(formData.get('image')).toBe(cover);
  });

  it('clears empty company and artist relations on update', async () => {
    const formData = await buildUpdateProjectFormData(
      {
        projectId: 'project-1',
        title: 'Project',
        companyName: '',
        artistName: '',
      },
      'user-123'
    );

    expect(formData.get('company')).toBe('');
    expect(formData.get('artist')).toBe('');
  });

  it('does not synthesize a completed date when updating status to completed', async () => {
    const formData = await buildUpdateProjectFormData(
      {
        projectId: 'project-1',
        title: 'Project',
        status: 'completed',
      },
      'user-123',
      'America/New_York'
    );

    expect(formData.get('status')).toBe('completed');
    expect(formData.has('date_completed')).toBe(false);
  });

  it('preserves an explicit completed date when updating status to completed', async () => {
    const formData = await buildUpdateProjectFormData(
      {
        projectId: 'project-1',
        title: 'Project',
        status: 'completed',
        dateCompleted: '2026-05-17',
      },
      'user-123',
      'America/New_York'
    );

    expect(formData.get('status')).toBe('completed');
    expect(formData.get('date_completed')).toBe('2026-05-17');
  });

  it('includes color count when updating a project', async () => {
    const formData = await buildUpdateProjectFormData(
      {
        projectId: 'project-1',
        title: 'Project',
        colorCount: 52,
      },
      'user-123'
    );

    expect(formData.get('color_count')).toBe('52');
  });

  it('preserves selected company and artist IDs even when labels are placeholder-like', async () => {
    resolverMock.resolveCompanyAndArtistIds.mockResolvedValueOnce({
      companyId: 'company-other-id',
      artistId: 'artist-unknown-id',
    });

    const formData = await buildUpdateProjectFormData(
      {
        projectId: 'project-1',
        title: 'Project',
        companyName: 'company-other-id',
        artistName: 'artist-unknown-id',
      },
      'user-123'
    );

    expect(formData.get('company')).toBe('company-other-id');
    expect(formData.get('artist')).toBe('artist-unknown-id');
  });

  it('writes an empty drill_shape when drillShape is null so PocketBase clears the select', async () => {
    const formData = await buildUpdateProjectFormData(
      {
        projectId: 'project-1',
        title: 'Project',
        drillShape: null,
      },
      'user-123'
    );

    expect(formData.get('drill_shape')).toBe('');
  });

  it('omits drill_shape when drillShape is undefined so partial updates leave it untouched', async () => {
    const formData = await buildUpdateProjectFormData(
      {
        projectId: 'project-1',
        title: 'Project',
      },
      'user-123'
    );

    expect(formData.has('drill_shape')).toBe(false);
  });

  it('preserves a set drill_shape value on update', async () => {
    const formData = await buildUpdateProjectFormData(
      {
        projectId: 'project-1',
        title: 'Project',
        drillShape: 'round',
      },
      'user-123'
    );

    expect(formData.get('drill_shape')).toBe('round');
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

  it('preserves concrete values and replacement files', async () => {
    resolverMock.resolveCompanyAndArtistIds.mockResolvedValueOnce({
      companyId: 'company-123',
      artistId: 'artist-123',
    });
    const imageFile = new File(['replacement'], 'replacement.jpg', { type: 'image/jpeg' });

    const formData = await buildUpdateProjectFormData(
      {
        projectId: 'project-1',
        title: 'Project',
        companyName: 'Company',
        artistName: 'Artist',
        width: 30,
        generalNotes: 'Notes',
        imageFile,
      },
      'user-123'
    );

    expect(formData.get('company')).toBe('company-123');
    expect(formData.get('artist')).toBe('artist-123');
    expect(formData.get('width')).toBe('30');
    expect(formData.get('general_notes')).toBe('Notes');
    expect(formData.get('image')).toBe(imageFile);
  });

  it('writes resolved relation IDs for ID-looking names on update', async () => {
    resolverMock.resolveCompanyAndArtistIds.mockResolvedValueOnce({
      companyId: 'abc123def456ghi',
      artistId: 'jkl789mno012pqr',
    });

    const formData = await buildUpdateProjectFormData(
      {
        projectId: 'project-1',
        companyName: 'DiamondArtStudi',
        artistName: 'GoldenBrushArts',
      },
      'user-123'
    );

    expect(resolverMock.resolveCompanyAndArtistIds).toHaveBeenCalledWith(
      'DiamondArtStudi',
      'GoldenBrushArts',
      'user-123'
    );
    expect(formData.get('company')).toBe('abc123def456ghi');
    expect(formData.get('artist')).toBe('jkl789mno012pqr');
  });

  it('writes an empty image value only for explicit image removal', async () => {
    const untouched = await buildUpdateProjectFormData(
      { projectId: 'project-1', title: 'Project' },
      'user-123'
    );
    const removed = await buildUpdateProjectFormData(
      { projectId: 'project-1', title: 'Project', imageRemoved: true },
      'user-123'
    );

    expect(untouched.has('image')).toBe(false);
    expect(removed.get('image')).toBe('');
  });

  it('sends changed tag IDs only when the edit command includes them', async () => {
    const unchanged = await buildUpdateProjectFormData(
      { projectId: 'project-1', title: 'Project' },
      'user-123'
    );
    const changed = await buildUpdateProjectFormData(
      {
        projectId: 'project-1',
        title: 'Project',
        expectedRevision: 0,
        tagIds: ['abc123def456ghi'],
      },
      'user-123'
    );

    expect(unchanged.has('og_tag_ids')).toBe(false);
    expect(changed.get('og_tag_ids')).toBe('["abc123def456ghi"]');
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

  it('requires a revision when an empty tag selection clears every tag', async () => {
    await expect(
      buildUpdateProjectFormData(
        {
          projectId: 'project-1',
          title: 'Project',
          tagIds: [],
        },
        'user-123'
      )
    ).rejects.toMatchObject({ reason: 'invalid_expected_revision' });

    expect(resolverMock.resolveCompanyAndArtistIds).not.toHaveBeenCalled();
  });

  it('rejects a non-integer tag edit revision before resolving relations', async () => {
    await expect(
      buildUpdateProjectFormData(
        {
          projectId: 'project-1',
          title: 'Project',
          companyName: 'New company',
          expectedRevision: Number.NaN,
          tagIds: ['abc123def456ghi'],
        },
        'user-123'
      )
    ).rejects.toMatchObject({ reason: 'invalid_expected_revision' });

    expect(resolverMock.resolveCompanyAndArtistIds).not.toHaveBeenCalled();
  });
});
