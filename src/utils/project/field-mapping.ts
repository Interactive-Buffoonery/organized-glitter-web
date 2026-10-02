/**
 * Utility functions for resolving project form relationship fields for PocketBase operations.
 */

import { createLogger } from '@/utils/logger';
import { CompaniesService } from '@/services/pocketbase/companies.service';
import { ArtistsService } from '@/services/pocketbase/artists.service';
import { ProjectRelationLookupError } from './projectSaveError';

/**
 * Resolves company and artist names to their corresponding PocketBase IDs
 * @param companyName - Company name to resolve (can be empty)
 * @param artistName - Artist name to resolve (can be empty)
 * @param userId - Current user ID for filtering
 * @returns Promise with resolved IDs or null if not found
 * @throws ProjectRelationLookupError when a lookup fails
 */
export async function resolveCompanyAndArtistIds(
  companyName: string | undefined,
  artistName: string | undefined,
  userId: string
): Promise<{ companyId: string | null; artistId: string | null }> {
  const logger = createLogger('resolveCompanyAndArtistIds');

  let companyId: string | null = null;
  let artistId: string | null = null;

  if (companyName && companyName !== '') {
    try {
      const companyRecord = await CompaniesService.findByName(companyName, userId);
      companyId = companyRecord?.id || null;
      logger.debug('Resolved company name to ID', { companyName, companyId });
    } catch (error) {
      throw new ProjectRelationLookupError('company', error);
    }
  }

  if (artistName && artistName !== '') {
    try {
      const artistRecord = await ArtistsService.findByName(artistName, userId);
      artistId = artistRecord?.id || null;
      logger.debug('Resolved artist name to ID', { artistName, artistId });
    } catch (error) {
      throw new ProjectRelationLookupError('artist', error);
    }
  }

  return { companyId, artistId };
}
