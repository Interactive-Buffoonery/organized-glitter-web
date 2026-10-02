import { beforeEach, describe, expect, it, vi } from 'vitest';

const companiesMock = vi.hoisted(() => ({
  findByName: vi.fn(),
}));

const artistsMock = vi.hoisted(() => ({
  findByName: vi.fn(),
}));

vi.mock('@/services/pocketbase/companies.service', () => ({
  CompaniesService: companiesMock,
}));

vi.mock('@/services/pocketbase/artists.service', () => ({
  ArtistsService: artistsMock,
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { resolveCompanyAndArtistIds } from '../field-mapping';

describe('resolveCompanyAndArtistIds', () => {
  beforeEach(() => {
    companiesMock.findByName.mockReset();
    artistsMock.findByName.mockReset();
  });

  it('treats placeholder-like names as ordinary taxonomy names', async () => {
    companiesMock.findByName.mockResolvedValue({ id: 'company-other', name: 'Other' });
    artistsMock.findByName.mockResolvedValue({ id: 'artist-unknown', name: 'Unknown' });

    const result = await resolveCompanyAndArtistIds('Other', 'Unknown', 'user-123');

    expect(companiesMock.findByName).toHaveBeenCalledWith('Other', 'user-123');
    expect(artistsMock.findByName).toHaveBeenCalledWith('Unknown', 'user-123');
    expect(result).toEqual({
      companyId: 'company-other',
      artistId: 'artist-unknown',
    });
  });

  it.each([
    ['DiamondArtStudio', 'GoldenBrushArtsX'],
    ['DiamondArtStudi', 'GoldenBrushArts'],
  ])('resolves ID-looking company and artist names (%s, %s)', async (companyName, artistName) => {
    companiesMock.findByName.mockResolvedValue({ id: 'abc123def456ghi' });
    artistsMock.findByName.mockResolvedValue({ id: 'jkl789mno012pqr' });

    const result = await resolveCompanyAndArtistIds(companyName, artistName, 'user-123');

    expect(companiesMock.findByName).toHaveBeenCalledWith(companyName, 'user-123');
    expect(artistsMock.findByName).toHaveBeenCalledWith(artistName, 'user-123');
    expect(result).toEqual({
      companyId: 'abc123def456ghi',
      artistId: 'jkl789mno012pqr',
    });
  });

  it('keeps blank values as empty relations', async () => {
    const result = await resolveCompanyAndArtistIds('', '', 'user-123');

    expect(companiesMock.findByName).not.toHaveBeenCalled();
    expect(artistsMock.findByName).not.toHaveBeenCalled();
    expect(result).toEqual({ companyId: null, artistId: null });
  });

  it.each([
    ['company', companiesMock.findByName, 'Acme Kits'],
    ['artist', artistsMock.findByName, 'Ada Artist'],
  ] as const)(
    'preserves a failed %s lookup as a project save error',
    async (relation, lookup, name) => {
      const cause = {
        type: 'server' as const,
        status: 503,
        retryable: true,
        message: 'Service unavailable',
      };
      lookup.mockRejectedValue(cause);

      const promise =
        relation === 'company'
          ? resolveCompanyAndArtistIds(name, undefined, 'user-123')
          : resolveCompanyAndArtistIds(undefined, name, 'user-123');

      await expect(promise).rejects.toMatchObject({
        name: 'ProjectRelationLookupError',
        relation,
        cause,
      });
    }
  );

  it('keeps a missing lookup result as a null relation', async () => {
    companiesMock.findByName.mockResolvedValue(null);
    artistsMock.findByName.mockResolvedValue(null);

    await expect(
      resolveCompanyAndArtistIds('Missing company', 'Missing artist', 'user-123')
    ).resolves.toEqual({ companyId: null, artistId: null });
  });
});
