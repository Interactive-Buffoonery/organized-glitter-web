import { notify } from '@/lib/notifications';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { parseCsvFileToProjects, ParsedCsvData } from '@/utils/csv/csvImport'; // Import ParsedCsvData
import { useImportCreateProject } from '@/hooks/useImportCreateProject';

import { ProjectCreateDTO } from '@/types/project';
import { isAuthenticated, getCurrentUser } from '@/services/auth';
import { PROJECT_IMAGE_MAX_FILE_SIZE } from '@/components/projects/ProgressNoteForm/constants';
import { createLogger } from '@/utils/logger';
import { AnalyticsEvent } from '@/services/analytics-events';
import {
  captureImportExportEvent,
  captureImportExportException,
  getDurationMs,
  getImportExportStatus,
} from '@/features/import-export/importExportTelemetry';
import { TAG_COLOR_PALETTE } from '@/utils/ui/tagColors'; // For default tag color
import { ImportTagsService } from '@/services/pocketbase/importTags.service';

const logger = createLogger('ProjectImport');
import { generateUniqueSlug } from '@/utils/ui/slugify';
import { validateProjectData, validateTagNames, ValidationIssue } from '@/utils/csv/csvValidation';
import {
  analyzeCSVFile,
  generateColumnValidationMessage,
  ColumnAnalysisResult,
} from '@/utils/csv/csvColumnAnalysis';
import {
  mapDacProjectToCreateDTO,
  markDacDuplicateProjects,
  parseDacCsvFile,
} from '@/features/import-export/csv/dacImport';
import {
  invalidateImportExportQueries,
  refreshImportExportQueriesBestEffort,
} from '@/features/import-export/archive/importInvalidation';
import { projectsService } from '@/services/pocketbase/projects.service';

const DEFAULT_TAG_COLOR_HEX = TAG_COLOR_PALETTE[0].hex; // Default color for new tags

interface ImportStats {
  successful: number;
  failed: number;
  total: number;
  skipped?: number;
  errors: string[];
  tagWarnings: string[];
  validationIssues: ValidationIssue[];
  columnAnalysis?: ColumnAnalysisResult;
  currentProject?: string;
}

export const useProjectImport = () => {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importStats, setImportStats] = useState<ImportStats>({
    successful: 0,
    failed: 0,
    total: 0,
    errors: [],
    tagWarnings: [],
    validationIssues: [],
  });

  const { createProject } = useImportCreateProject();

  const importProjectsFromCSV = async (file: File): Promise<boolean> => {
    if (!file) {
      notify({
        kind: 'error',
        title: 'No file selected',
        description: 'Please select a CSV file to import',
      });
      return false;
    }

    // Check file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
      notify({
        kind: 'error',
        title: 'Invalid file type',
        description: 'Please select a CSV file',
      });
      return false;
    }

    // Check file size
    const MAX_SIZE = PROJECT_IMAGE_MAX_FILE_SIZE;
    const MAX_SIZE_MB = MAX_SIZE / (1024 * 1024);
    if (file.size > MAX_SIZE) {
      notify({
        kind: 'error',
        title: 'File too large',
        description: `Maximum file size is ${MAX_SIZE_MB}MB`,
      });
      return false;
    }

    // Get current user first
    if (!isAuthenticated()) {
      notify({
        kind: 'error',
        title: 'Authentication error',
        description: 'Please log in to import projects',
      });
      return false;
    }

    const user = getCurrentUser();
    if (!user) {
      notify({
        kind: 'error',
        title: 'Authentication error',
        description: 'Please log in to import projects',
      });
      return false;
    }

    setLoading(true);
    setProgress(0);
    const startedAt = Date.now();
    setImportStats({
      successful: 0,
      failed: 0,
      total: 0,
      errors: [],
      tagWarnings: [],
      validationIssues: [],
    });

    try {
      // Step 1: Analyze CSV columns before parsing
      logger.debug('Analyzing CSV column structure...');
      const columnAnalysis = await analyzeCSVFile(file);
      const validationMessage = generateColumnValidationMessage(columnAnalysis);

      // Log column analysis results
      logger.debug('CSV column analysis complete', {
        detectedColumns: columnAnalysis.detectedColumns.length,
        missingRequired: columnAnalysis.missingRequired.length,
        missingOptional: columnAnalysis.missingOptional.length,
        unmappedColumns: columnAnalysis.unmappedColumns.length,
        hasAllRequired: columnAnalysis.summary.hasAllRequired,
        canProceed: validationMessage.canProceed,
      });

      // Check if we can proceed with import
      if (!validationMessage.canProceed) {
        notify({
          kind: 'error',
          title: 'CSV Validation Failed',
          description: validationMessage.message,
        });
        setLoading(false);
        return false;
      }

      // Show column validation feedback
      if (validationMessage.severity === 'warning') {
        notify({
          kind: 'info',
          title: 'Column Mapping Notice',
          description: validationMessage.message,
        });
      } else if (validationMessage.severity === 'success') {
        notify({
          kind: 'info',
          title: 'Column Analysis Complete',
          description: validationMessage.message,
        });
      }

      // Update import stats with column analysis
      setImportStats(prev => ({ ...prev, columnAnalysis }));

      // Debug CSV tag parsing (ORG-36)
      logger.debug('Running CSV tag debug analysis...');
      // logCSVTagDebugInfo removed for PocketBase migration

      // Step 2: Parse CSV file directly using Papa Parse with progress callback
      const { projects: parsedCsvProjects, allUniqueTagNames }: ParsedCsvData =
        await parseCsvFileToProjects(file, parseProgress => {
          // Papa Parse progress is for parsing, we'll map it to ~10% of total progress initially
          const mappedProgress = Math.round(parseProgress * 0.1);
          setProgress(mappedProgress);
        });

      if (!parsedCsvProjects || parsedCsvProjects.length === 0) {
        notify({
          kind: 'error',
          title: 'No valid projects found',
          description: 'Please check your CSV format and try again',
        });
        setLoading(false);
        return false;
      }

      // --- BEGIN BATCH TAG PROCESSING ---
      logger.debug('Starting batch tag processing...', {
        allUniqueTagNamesCount: allUniqueTagNames.length,
      });

      // Get existing tags first to include them in validation
      const existingUserTags = await ImportTagsService.listUserTags(user.id);

      // Combine CSV tag names with existing tag names for validation
      const allTagNamesForValidation = [...allUniqueTagNames, ...existingUserTags.map(t => t.name)];

      // Validate all tag names (CSV + existing)
      const tagValidationResult = validateTagNames(allTagNamesForValidation);
      const allValidationIssues: ValidationIssue[] = [...tagValidationResult.issues];

      // Use validated tag names
      const validatedTagNamesMap = new Map(
        tagValidationResult.validatedTags.map(({ original, normalized }) => [original, normalized])
      );

      const tagNameMap: Record<string, string> = {};
      const currentTagWarnings: string[] = []; // Use a local var for warnings during this phase

      try {
        // Build tag name map using normalized names
        existingUserTags.forEach(tag => {
          // Map by exact name
          tagNameMap[tag.name] = tag.id;

          // Also map by normalized name to prevent duplicate creation
          const normalizedTagName = validatedTagNamesMap.get(tag.name) || tag.name;
          if (normalizedTagName !== tag.name) {
            tagNameMap[normalizedTagName] = tag.id;
          }
        });
        logger.debug('Built tag name map from existing tags.', {
          count: existingUserTags.length,
          mappedNames: Object.keys(tagNameMap),
        });

        const newTagNamesToCreate: string[] = [];
        allUniqueTagNames.forEach(originalName => {
          const normalizedName = validatedTagNamesMap.get(originalName) || originalName;
          if (normalizedName && normalizedName.trim() !== '' && !tagNameMap[normalizedName]) {
            // Ensure normalized name is not empty and not already mapped
            newTagNamesToCreate.push(normalizedName);
          }
        });
        logger.debug('Identified new tags to create.', {
          count: newTagNamesToCreate.length,
          newTagNamesToCreate,
        });

        // Update progress after fetching existing tags (e.g., to 15%)
        setProgress(15);

        let createdTagsCount = 0;
        for (const tagName of newTagNamesToCreate) {
          try {
            // Create a function to check if slug exists for this user
            const checkSlugExists = async (slug: string): Promise<boolean> => {
              try {
                return await ImportTagsService.slugExists(user.id, slug);
              } catch (error) {
                // If error checking, assume it DOES exist to prevent duplicate creation
                // This conservative approach avoids duplicate slugs at the cost of potentially
                // generating a longer slug than necessary
                logger.warn(
                  `Error checking slug existence for "${slug}", assuming it exists to prevent duplicates:`,
                  error
                );
                return true;
              }
            };

            // Generate unique slug for this user
            const uniqueSlug = await generateUniqueSlug(tagName, checkSlugExists);

            const newTagData = {
              name: tagName,
              slug: uniqueSlug,
              color: DEFAULT_TAG_COLOR_HEX,
            };
            const createdTag = await ImportTagsService.createTag({
              ...newTagData,
              userId: user.id,
            });
            tagNameMap[tagName] = createdTag.id;
            createdTagsCount++;
            logger.debug(`Successfully created new tag: ${tagName}`, {
              id: createdTag.id,
              slug: uniqueSlug,
            });
          } catch (tagCreateError) {
            logger.error(`Failed to pre-create new tag: ${tagName}`, tagCreateError);
            currentTagWarnings.push(
              `Failed to pre-create tag: ${tagName} (${tagCreateError instanceof Error ? tagCreateError.message : 'Unknown error'})`
            );
          }
          // Update progress during new tag creation (e.g., 15% to 25%)
          setProgress(Math.round(15 + (createdTagsCount / (newTagNamesToCreate.length || 1)) * 10));
        }
        logger.debug('Finished creating new tags and updated map.', {
          finalMapSize: Object.keys(tagNameMap).length,
          createdCount: createdTagsCount,
        });
      } catch (batchTagError) {
        logger.error('Error during batch tag processing:', batchTagError);
        currentTagWarnings.push(
          `Critical error during batch tag processing: ${batchTagError instanceof Error ? batchTagError.message : 'Unknown error'}`
        );
        // Decide if to proceed or halt; for now, we'll add to warnings and proceed
      }
      // --- END BATCH TAG PROCESSING ---

      // Convert parsed projects to ProjectCreateDTO format with validation
      const projectsToCreate: ProjectCreateDTO[] = parsedCsvProjects.map(
        (parsedProject): ProjectCreateDTO => {
          // Validate and normalize project data
          const projectValidation = validateProjectData({
            title: parsedProject.title,
            drillShape: parsedProject.drillShape,
            status: parsedProject.status,
            kitCategory: parsedProject.kitCategory,
            datePurchased: parsedProject.datePurchased,
            dateReceived: parsedProject.dateReceived,
            dateStarted: parsedProject.dateStarted,
            dateCompleted: parsedProject.dateCompleted,
            generalNotes: parsedProject.generalNotes,
            sourceUrl: parsedProject.sourceUrl,
          });

          // Add validation issues to our tracking
          allValidationIssues.push(...projectValidation.issues);

          // Map tag names to IDs using validated names
          const projectTagIds = (parsedProject.tagNames || [])
            .map(originalName => {
              const normalizedName = validatedTagNamesMap.get(originalName) || originalName;
              return tagNameMap[normalizedName];
            })
            .filter(id => !!id) as string[];

          return {
            userId: user.id,
            title: projectValidation.correctedData.title || 'Untitled Project',
            company: parsedProject.company,
            artist: parsedProject.artist,
            drillShape: projectValidation.correctedData.drillShape ?? undefined,
            width: parsedProject.width,
            height: parsedProject.height,
            status: projectValidation.correctedData.status,
            datePurchased: projectValidation.correctedData.datePurchased ?? undefined,
            dateReceived: projectValidation.correctedData.dateReceived ?? undefined,
            dateStarted: projectValidation.correctedData.dateStarted ?? undefined,
            dateCompleted: projectValidation.correctedData.dateCompleted ?? undefined,
            generalNotes: projectValidation.correctedData.generalNotes ?? undefined,
            imageUrl: parsedProject.imageUrl,
            sourceUrl: projectValidation.correctedData.sourceUrl ?? undefined,
            totalDiamonds: parsedProject.totalDiamonds,
            colorCount: parsedProject.colorCount,
            kitCategory: projectValidation.correctedData.kitCategory,
            tagIds: projectTagIds, // Pass resolved tag IDs
          };
        }
      );

      // Initialize progress tracking
      const totalProjects = projectsToCreate.length;
      setImportStats(prev => ({ ...prev, total: totalProjects }));

      // Import each project
      let successCount = 0;
      let failedCount = 0;
      const errors: string[] = [];
      // Initialize tagWarnings with any from the batch processing phase
      let tagWarnings: string[] = [...currentTagWarnings];

      // Start project import progress from ~25% (10% parsing, 15% tag batching)
      const baseProgressForProjectLoop = 25;

      for (let i = 0; i < projectsToCreate.length; i++) {
        const project = projectsToCreate[i];

        // Update current project being imported
        setImportStats(prev => ({ ...prev, currentProject: project.title }));

        try {
          const result = await createProject(project); // createProject now expects tagIds
          successCount++;

          // Check for tag linking issues from createProject
          if (result.tagImportResult && result.tagImportResult.failedTags > 0) {
            const tagWarning = `Project "${project.title}": ${result.tagImportResult.failedTags} out of ${result.tagImportResult.totalTags} tags failed to link`;
            tagWarnings = [...tagWarnings, tagWarning];

            result.tagImportResult.errors.forEach(error => {
              tagWarnings = [...tagWarnings, `  - ${error}`];
            });
          }
        } catch (error) {
          logger.error(`Error importing project at index ${i}:`, error);
          failedCount++;

          const errorMessage =
            error instanceof Error
              ? error.message
              : `Failed to import project "${project.title || 'Untitled'}"`;

          errors.push(errorMessage);
        }

        // Update progress (remaining 75% for creating projects)
        const importProgress = Math.round(
          baseProgressForProjectLoop +
            ((i + 1) / totalProjects) * (100 - baseProgressForProjectLoop)
        );
        setProgress(importProgress);

        setImportStats({
          successful: successCount,
          failed: failedCount,
          total: totalProjects,
          errors,
          tagWarnings,
          validationIssues: allValidationIssues,
          columnAnalysis,
          currentProject: project.title,
        });

        if (i < projectsToCreate.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200)); // Reduced delay, as tag creation is batched
        }
      }

      let successMessage = `Successfully imported ${successCount} out of ${totalProjects} projects. View them in your library.`;

      const totalIssues = tagWarnings.length + allValidationIssues.length;
      if (totalIssues > 0) {
        successMessage += ` Note: ${totalIssues} data issues were automatically corrected (see details below).`;
      }

      // Add column mapping summary to success message
      const mappedColumns = importStats.columnAnalysis?.detectedColumns.length || 0;
      if (mappedColumns > 0) {
        successMessage += ` Mapped ${mappedColumns} CSV columns successfully.`;
      }

      captureImportExportEvent(AnalyticsEvent.IMPORT_COMPLETED, {
        source: 'organized_csv',
        status: getImportExportStatus({
          success: failedCount === 0,
          records: successCount,
          errors: failedCount,
          warnings: tagWarnings.length + allValidationIssues.length,
        }),
        records: successCount,
        errors: failedCount,
        warnings: tagWarnings.length + allValidationIssues.length,
        duration_ms: getDurationMs(startedAt),
      });

      notify({ kind: 'info', title: 'Import complete', description: successMessage });

      if (tagWarnings.length > 0) {
        logger.warn('Tag processing/linking warnings:', { tagWarnings });
      }

      if (allValidationIssues.length > 0) {
        logger.warn('Data validation issues corrected:', {
          validationIssues: allValidationIssues.map(issue => ({
            field: issue.field,
            severity: issue.severity,
            message: issue.message,
            originalValue: issue.originalValue,
            correctedValue: issue.correctedValue,
          })),
        });
      }

      // Clear current project when import completes
      setImportStats(prev => ({ ...prev, currentProject: undefined }));
      await refreshImportExportQueriesBestEffort(
        () =>
          invalidateImportExportQueries(queryClient, [], {
            exceptionSource: 'organized_csv_import',
          }),
        'organized_csv_import'
      );

      return true;
    } catch (error) {
      logger.error('Import error:', error);
      captureImportExportException(error, {
        source: 'organized_csv_import',
        operation: 'import_organized_csv',
        status: 'failed',
        failed_count: 1,
      });
      captureImportExportEvent(AnalyticsEvent.IMPORT_COMPLETED, {
        source: 'organized_csv',
        status: 'failed',
        errors: 1,
        duration_ms: getDurationMs(startedAt),
      });

      notify({
        kind: 'error',
        title: 'Import failed',
        description: error instanceof Error ? error.message : 'Failed to import projects',
      });

      setImportStats(prev => ({
        ...prev,
        errors: [
          ...prev.errors,
          error instanceof Error ? error.message : 'Unknown error during import',
        ],

        tagWarnings: [],
        validationIssues: [],
        columnAnalysis: prev.columnAnalysis, // Preserve column analysis if it was completed
        currentProject: undefined, // Clear current project on error
      }));

      return false;
    } finally {
      setLoading(false);
    }
  };

  const importDacProjectsFromCSV = async (file: File): Promise<boolean> => {
    if (!file) {
      notify({
        kind: 'error',
        title: 'No file selected',
        description: 'Please select a Diamond Art Club CSV file to import',
      });
      return false;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      notify({
        kind: 'error',
        title: 'Invalid file type',
        description: 'Please select a CSV file',
      });
      return false;
    }

    if (!isAuthenticated()) {
      notify({
        kind: 'error',
        title: 'Authentication error',
        description: 'Please log in to import projects',
      });
      return false;
    }

    const user = getCurrentUser();
    if (!user) {
      notify({
        kind: 'error',
        title: 'Authentication error',
        description: 'Please log in to import projects',
      });
      return false;
    }

    setLoading(true);
    setProgress(0);
    const startedAt = Date.now();
    setImportStats({
      successful: 0,
      failed: 0,
      total: 0,
      errors: [],
      tagWarnings: [],
      validationIssues: [],
    });

    try {
      const preview = await parseDacCsvFile(file);
      if (preview.projects.length === 0) {
        notify({
          kind: 'error',
          title: 'No DAC products found',
          description: 'No products could be imported from this Diamond Art Club CSV file.',
        });
        return false;
      }

      const existingProjects = await projectsService.getAllForUser(user.id);
      const projectsWithDuplicateStatus = markDacDuplicateProjects(
        preview.projects,
        existingProjects
      );
      const duplicateCount = projectsWithDuplicateStatus.filter(project =>
        Boolean(project.duplicateReason)
      ).length;
      const projectsToCreate = projectsWithDuplicateStatus
        .filter(project => !project.duplicateReason)
        .map(project => mapDacProjectToCreateDTO(project, user.id));

      let successful = 0;
      let failed = 0;
      const errors: string[] = [];

      setImportStats(prev => ({
        ...prev,
        total: preview.projects.length,
        skipped: duplicateCount,
      }));

      for (let i = 0; i < projectsToCreate.length; i++) {
        const project = projectsToCreate[i];
        setImportStats(prev => ({ ...prev, currentProject: project.title }));

        try {
          await createProject(project);
          successful += 1;
        } catch (error) {
          failed += 1;
          captureImportExportException(error, {
            source: 'dac_import',
            operation: 'import_dac_project',
            status: successful > 0 ? 'partial' : 'failed',
            failed_count: failed,
          });
          errors.push(
            error instanceof Error ? error.message : `Failed to import "${project.title}"`
          );
        }

        setProgress(Math.round(((i + 1) / projectsToCreate.length) * 100));
        setImportStats({
          successful,
          failed,
          total: preview.projects.length,
          skipped: duplicateCount,
          errors,
          tagWarnings: [],
          validationIssues: [],
          currentProject: project.title,
        });
      }

      setImportStats(prev => ({ ...prev, currentProject: undefined }));
      await refreshImportExportQueriesBestEffort(
        () =>
          invalidateImportExportQueries(queryClient, [], {
            exceptionSource: 'dac_import',
          }),
        'dac_import'
      );
      captureImportExportEvent(AnalyticsEvent.DAC_IMPORT_COMPLETED, {
        source: 'dac_csv',
        status: getImportExportStatus({
          success: failed === 0,
          records: successful,
          errors: failed,
        }),
        records: successful,
        skipped: duplicateCount,
        errors: failed,
        duration_ms: getDurationMs(startedAt),
      });

      notify({
        kind: failed > 0 ? 'warning' : 'success',
        title: failed > 0 ? 'DAC import completed with errors' : 'DAC import complete',
        description: `${successful} project${successful === 1 ? '' : 's'} imported from Diamond Art Club. ${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'} skipped.`,
      });

      return successful > 0 || duplicateCount > 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import DAC CSV';
      logger.error('DAC import error:', error);
      captureImportExportException(error, {
        source: 'dac_import',
        operation: 'import_dac_csv',
        status: 'failed',
        failed_count: 1,
      });
      captureImportExportEvent(AnalyticsEvent.DAC_IMPORT_COMPLETED, {
        source: 'dac_csv',
        status: 'failed',
        errors: 1,
        duration_ms: getDurationMs(startedAt),
      });
      notify({ kind: 'error', title: 'DAC import failed', description: message });
      setImportStats(prev => ({
        ...prev,
        errors: [...prev.errors, message],
        currentProject: undefined,
      }));
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    importProjectsFromCSV,
    importDacProjectsFromCSV,
    loading,
    progress,
    importStats,
  };
};
