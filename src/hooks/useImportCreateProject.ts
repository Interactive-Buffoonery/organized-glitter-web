import { useState } from 'react';
import { ProjectCreateDTO } from '@/types/project';
import { ProjectDTO } from '@/services/types';
import { isAuthenticated, getCurrentUser } from '@/services/auth';
import { CompaniesService } from '@/services/pocketbase/companies.service';
import { ArtistsService } from '@/services/pocketbase/artists.service';
import { projectsService } from '@/services/pocketbase/projects.service';
import { TagService } from '@/services/pocketbase/tags.service';
import { logger } from '@/utils/logger';
import { queuedPbRequest } from '@/utils/error/rateLimit';

// Type for tag import results
export interface TagImportResult {
  totalTags: number;
  successfulTags: number;
  failedTags: number;
  errors: string[];
}

// Type for project creation result with tag import info
export interface ProjectCreationResult {
  project: ProjectDTO;
  tagImportResult?: TagImportResult;
}

export const useImportCreateProject = () => {
  const [loading, setLoading] = useState(false);

  const createProject = async (data: ProjectCreateDTO): Promise<ProjectCreationResult> => {
    setLoading(true);

    try {
      // Get current user
      if (!isAuthenticated()) {
        logger.error('No user found when creating project');
        throw new Error('User not authenticated');
      }

      const user = getCurrentUser();
      if (!user) {
        logger.error('No user found when creating project');
        throw new Error('User not authenticated');
      }
      const userId = user.id;

      // Prepare data object for PocketBase
      // Only include fields that exist in the database schema
      const projectData = {
        title: data.title || '', // Ensure title is always a string
        user: userId,
        // Handle company and artist IDs - we'll need to resolve these
        company: null as string | null, // Will be resolved below if needed
        artist: null as string | null, // Will be resolved below if needed
        width: data.width || null,
        height: data.height || null,
        drill_shape: data.drillShape || null,
        status: data.status || 'wishlist',
        date_purchased: data.datePurchased || null,
        date_received: data.dateReceived || null,
        date_started: data.dateStarted || null,
        date_completed: data.dateCompleted || null,
        general_notes: data.generalNotes || null,
        image: data.imageUrl || null,
        source_url: data.sourceUrl || null,
        total_diamonds: data.totalDiamonds ? Number(data.totalDiamonds) : null,
        color_count: data.colorCount ? Number(data.colorCount) : null,
        kit_category: data.kitCategory || 'full',
      };

      // Resolve company ID if company name is provided
      if (data.company && data.company !== 'other') {
        try {
          const existing = await queuedPbRequest(() => CompaniesService.findByName(data.company!));
          if (existing) {
            projectData.company = existing.id;
          } else {
            const newCompany = await queuedPbRequest(() =>
              CompaniesService.create({ name: data.company! })
            );
            projectData.company = newCompany.id;
          }
        } catch (error) {
          logger.warn('Failed to resolve/create company:', error);
        }
      }

      // Resolve artist ID if artist name is provided
      if (data.artist && !['other', 'unknown'].includes(data.artist)) {
        try {
          const existing = await queuedPbRequest(() => ArtistsService.findByName(data.artist!));
          if (existing) {
            projectData.artist = existing.id;
          } else {
            const newArtist = await queuedPbRequest(() =>
              ArtistsService.create({ name: data.artist! })
            );
            projectData.artist = newArtist.id;
          }
        } catch (error) {
          logger.warn('Failed to resolve/create artist:', error);
        }
      }

      // Save new project to PocketBase
      const newProject = await queuedPbRequest(() => projectsService.create(projectData));

      if (!newProject || !newProject.id) {
        logger.error('Project creation failed: no valid project data returned', {
          projectData,
          newProject,
        });
        throw new Error('Project creation failed: no valid project ID returned');
      }

      // Handle tags if provided (now expecting tagIds)
      if (data.tagIds && data.tagIds.length > 0) {
        logger.debug(
          `Processing ${data.tagIds.length} pre-resolved tags for project "${data.title}":`,
          { tagIds: data.tagIds }
        );
        const tagResults: TagImportResult = {
          totalTags: data.tagIds.length,
          successfulTags: 0,
          failedTags: 0,
          errors: [] as string[],
        };

        for (const tagId of data.tagIds) {
          if (!tagId.trim()) {
            logger.debug('Skipping empty tag ID'); // Should not happen if tagIds are validated
            tagResults.failedTags++;
            tagResults.errors.push('Encountered an empty tag ID during linking.');
            continue;
          }

          const tagProcessingStart = Date.now();
          logger.debug(`Attempting to link tag ${tagId} to project ${newProject.id}`);

          try {
            await queuedPbRequest(() =>
              TagService.addTagToProject(newProject.id, tagId).then(r => {
                if (r.status === 'error') throw r.error;
              })
            );
            logger.debug(`Successfully linked tag ${tagId} to project ${newProject.id}`);
            tagResults.successfulTags++;
          } catch (linkError) {
            logger.error(`Error linking tag ${tagId} to project ${newProject.id}`, linkError, {
              project: newProject.id,
              tag: tagId,
              user: userId,
            });
            tagResults.failedTags++;
            tagResults.errors.push(
              `Tag linking failed for tag ID "${tagId}": ${linkError instanceof Error ? linkError.message : 'Unknown error'}`
            );
          }
          const tagProcessingTime = Date.now() - tagProcessingStart;
          logger.debug(`Tag ID "${tagId}" linking processing completed in ${tagProcessingTime}ms`);
        }

        logger.debug(`Tag linking summary for project "${data.title}":`, {
          totalTags: tagResults.totalTags,
          successfulTags: tagResults.successfulTags,
          failedTags: tagResults.failedTags,
          successRate:
            tagResults.totalTags > 0
              ? `${((tagResults.successfulTags / tagResults.totalTags) * 100).toFixed(1)}%`
              : 'N/A',
          errors: tagResults.errors,
        });

        if (tagResults.failedTags > 0) {
          logger.warn(
            `${tagResults.failedTags} out of ${tagResults.totalTags} tags failed to link for project "${data.title}"`,
            {
              projectTitle: data.title,
              failedLinks: tagResults.failedTags,
              totalTags: tagResults.totalTags,
            }
          );
        }

        return {
          project: newProject,
          tagImportResult: tagResults,
        };
      } else {
        logger.debug(`No tag IDs provided for project "${data.title}"`);
        return {
          project: newProject,
          tagImportResult: undefined,
        };
      }
    } catch (error) {
      logger.error('Error creating project:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return {
    createProject,
    loading,
  };
};
