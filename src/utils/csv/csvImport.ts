import { ProjectType } from '@/types/project';
import Papa from 'papaparse';
import { logger } from '@/utils/logger';
import { safeDateString } from '@/utils/date/dateHelpers';
import { normalizeStatus, validateKitCategoryValue } from '@/utils/csv/csvValidation';
import { restoreCsvFormulaTextField } from '@/utils/csv/csvFormulaSafety';

export interface ParsedCsvData {
  projects: Partial<ProjectType>[];
  allUniqueTagNames: string[];
}

/**
 * Parse a single CSV row into a project object
 * @param row The CSV row data
 * @returns Partial project object or null if invalid
 */
const parseProjectFromRow = (row: Record<string, string>): Partial<ProjectType> | null => {
  const project: Partial<ProjectType> = {};

  // Map values to project object using flexible header matching
  const title = getTextFieldValue(row, ['title', 'name', 'project name', 'project title']);
  if (!title) {
    // Skip projects without a title (required field)
    return null;
  }
  project.title = title;

  const status = getTextFieldValue(row, ['status', 'state', 'project status']);
  if (status) {
    project.status = normalizeStatus(status).normalized;
  }

  const company = getTextFieldValue(row, ['company', 'manufacturer', 'brand']);
  if (company) {
    project.company = company;
  }

  const artist = getTextFieldValue(row, ['artist', 'creator', 'designer']);
  if (artist) {
    project.artist = artist;
  }

  // Handle dimensions - support both separate width/height and combined dimensions
  // Also support legacy "Length" header for backward compatibility
  const width = getFieldValue(row, ['width']);
  if (width) {
    const widthValue = parseFloat(width);
    if (!isNaN(widthValue)) {
      project.width = widthValue;
    }
  }

  const height = getFieldValue(row, ['height', 'length']); // Support legacy "Length" header
  if (height) {
    const heightValue = parseFloat(height);
    if (!isNaN(heightValue)) {
      project.height = heightValue;
    }
  }

  // Backwards compatibility: if dimensions column exists but width/height don't
  const dimensions = getFieldValue(row, ['dimensions']);
  if (dimensions && !project.width && !project.height) {
    // Match the complete pair so malformed values cannot supply partial dimensions.
    const match = dimensions.match(/^(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)$/);
    if (match) {
      const widthValue = parseFloat(match[1]);
      const heightValue = parseFloat(match[2]);
      if (!isNaN(widthValue)) {
        project.width = widthValue;
      }
      if (!isNaN(heightValue)) {
        project.height = heightValue;
      }
    }
  }

  const drillShape = getTextFieldValue(row, ['drill shape', 'shape']);
  if (drillShape) {
    project.drillShape = drillShape;
  }

  const canvasType = getTextFieldValue(row, ['canvas type', 'canvas']);
  if (canvasType) {
    project.canvasType = canvasType;
  }

  const drillType = getTextFieldValue(row, ['drill type', 'drilltype']);
  if (drillType) {
    project.drillType = drillType;
  }

  const kitCategory = getTextFieldValue(row, [
    'type of kit',
    'kit category',
    'category',
    'kit_category',
  ]);
  if (kitCategory) {
    const validatedCategory = validateKitCategoryValue(kitCategory);
    if (validatedCategory) {
      project.kitCategory = validatedCategory;
    }
  }

  const datePurchased = getFieldValue(row, ['date purchased']);
  if (datePurchased) {
    project.datePurchased = validateDate(datePurchased);
  }

  const dateStarted = getFieldValue(row, ['date started']);
  if (dateStarted) {
    project.dateStarted = validateDate(dateStarted);
  }

  const dateCompleted = getFieldValue(row, ['date completed']);
  if (dateCompleted) {
    project.dateCompleted = validateDate(dateCompleted);
  }

  const notes = getTextFieldValue(row, ['notes', 'general notes']);
  if (notes) {
    project.generalNotes = notes;
  }

  const sourceUrl = getTextFieldValue(row, [
    'source url',
    'project url',
    'source_url',
    'project_url',
    'url',
    'source',
    'link',
  ]);
  if (sourceUrl) {
    project.sourceUrl = sourceUrl;
  }

  const totalDiamonds = getFieldValue(row, [
    'total diamonds',
    'diamond count',
    'diamonds',
    'count',
  ]);
  if (totalDiamonds) {
    // Remove commas and other formatting characters, then parse as integer.
    // Only accept strictly positive integers; the create-time zod schema
    // rejects 0 with `.positive()`, so coerce 0/negative to "unset" here
    // rather than letting the row fail on submit.
    const cleanedValue = totalDiamonds.replace(/[,\s]/g, '');
    const diamondCount = parseInt(cleanedValue, 10);
    if (!isNaN(diamondCount) && diamondCount > 0) {
      project.totalDiamonds = diamondCount;
    }
  }

  const colorCount = getFieldValue(row, [
    '# of colors',
    'number of colors',
    'color count',
    'colors',
  ]);
  if (colorCount) {
    const cleanedValue = colorCount.replace(/[,\s]/g, '');
    if (/^\d+$/.test(cleanedValue)) {
      const parsedColorCount = parseInt(cleanedValue, 10);
      if (parsedColorCount > 0) {
        project.colorCount = parsedColorCount;
      }
    }
  }

  const dateReceived = getFieldValue(row, ['date received']);
  if (dateReceived) {
    project.dateReceived = validateDate(dateReceived);
  }

  // Handle tags - parse semicolon-separated tag names
  const tagsString = getTextFieldValue(row, ['tags', 'tag', 'labels']);
  if (tagsString) {
    // Split by semicolon and clean up tag names
    const tagNames = tagsString
      .split(';')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    project.tagNames = tagNames;
  } else {
    // Ensure consistent behavior: always include tagNames as empty array when no tags
    project.tagNames = [];
  }

  return project;
};

/**
 * Parse CSV data into an array of project objects using Papa Parse
 * @param csvContent The CSV content as a string
 * @param onProgress Optional progress callback for large files
 * @returns Promise that resolves to an object containing projects and all unique tag names
 */
export const parseCsvToProjects = (
  csvContent: string,
  onProgress?: (progress: number) => void
): Promise<ParsedCsvData> => {
  return new Promise((resolve, reject) => {
    if (!csvContent.trim()) {
      reject(new Error('CSV content is empty'));
      return;
    }

    const projects: Partial<ProjectType>[] = [];
    const parsingWarnings: Papa.ParseError[] = [];

    Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.toLowerCase().trim(),
      step: results => {
        parsingWarnings.push(...results.errors);
        const project = parseProjectFromRow(results.data as Record<string, string>);
        if (project) projects.push(project);
        if (onProgress) {
          const progress = Math.round((results.meta.cursor / csvContent.length) * 100);
          onProgress(Math.min(progress, 99));
        }
      },
      complete: () => {
        try {
          if (parsingWarnings.length > 0) {
            logger.warn('CSV parsing warnings:', parsingWarnings);
          }
          onProgress?.(100);

          const allTagNamesArrays = projects.map(p => p.tagNames || []);
          const allUniqueTagNames = Array.from(new Set(allTagNamesArrays.flat()));

          resolve({ projects, allUniqueTagNames });
        } catch (error) {
          reject(error);
        }
      },
      error: (error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        reject(new Error(`CSV parsing failed: ${errorMessage}`));
      },
    });
  });
};

/**
 * Parse CSV file with streaming support for large files
 * @param file The CSV file to parse
 * @param onProgress Optional progress callback
 * @returns Promise that resolves to an object containing projects and all unique tag names
 */
export const parseCsvFileToProjects = (
  file: File,
  onProgress?: (progress: number) => void
): Promise<ParsedCsvData> => {
  return new Promise((resolve, reject) => {
    const projects: Partial<ProjectType>[] = [];
    let rowCount = 0;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.toLowerCase().trim(),
      step: results => {
        // Process each row as it's parsed (streaming)
        const row = results.data as Record<string, string>;

        try {
          const project = parseProjectFromRow(row);
          if (project) {
            projects.push(project);
            rowCount++;
          }

          // Report progress every 100 rows
          if (onProgress && rowCount % 100 === 0) {
            // Approximate progress based on bytes read vs file size
            const progress = Math.round((results.meta.cursor / file.size) * 100);
            onProgress(Math.min(progress, 99)); // Cap at 99% until complete
          }
        } catch (error) {
          logger.warn('Error processing CSV row:', error, row);
        }
      },
      complete: () => {
        if (onProgress) {
          onProgress(100);
        }
        const allTagNamesArrays = projects.map(p => p.tagNames || []);
        const allUniqueTagNames = Array.from(new Set(allTagNamesArrays.flat()));
        resolve({ projects, allUniqueTagNames });
      },
      error: (error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        reject(new Error(`CSV file parsing failed: ${errorMessage}`));
      },
    });
  });
};

/**
 * Get field value using flexible header matching
 */
const getFieldValue = (
  row: Record<string, string>,
  possibleHeaders: string[]
): string | undefined => {
  for (const header of possibleHeaders) {
    const value = row[header];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

const getTextFieldValue = (
  row: Record<string, string>,
  possibleHeaders: string[]
): string | undefined => {
  const value = getFieldValue(row, possibleHeaders);
  return value ? restoreCsvFormulaTextField(value) : undefined;
};

/**
 * Validate and format a date string
 */
const validateDate = (dateStr: string): string | undefined => {
  if (!dateStr) return undefined;

  // Use timezone-safe conversion (defaults to UTC for backwards compatibility)
  const result = safeDateString(dateStr);
  return result || undefined;
};
